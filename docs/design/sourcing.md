# Wave 2.6 — Sourcing (Module 6) Design — *first slice*

**Status:** design (architect). Backend/frontend implement models + repo + service + routes + client
inventory + tests from this spec. **Design only — no implementation, no migration, no commit.**
Conforms to `DECISIONS.md` (wins on conflict — esp. **D2** the funnel moved up; promote writes the
candidate to **Postgres**, one store), `DATA-MODEL.md` (`SourceLead`, `outreach_attempts`),
`IMPLEMENTATION-PLAN.md` §2.6, `MODULE-BREAKDOWN.md` §9 (Sourcing), `API-CONTRACT.md`
(`source_lead_*`), `STACK-ARCHITECTURE.md`, `CONVENTIONS.md`, and the existing Wave 1.1/2.1/2.4
candidate build.

**Feature (this slice):** the pre-pipeline **lead** funnel — source leads, log outreach attempts
(which advance the lead through the Outreach stages), mark a lead **Responded (Hot/Cold)**, and
**promote** a hot lead into the candidate pipeline (**creates a real Candidate in Postgres**). Plus a
`/sourcing` inventory (list + filters + keyset pagination), add-lead, and soft-delete. Ports
`legacy/index.html` ~4353–4655 (Module 9) in behavior, on the new stack.

**Reuses (does NOT rebuild):** `LEAD_STATUSES`/`isLeadStatus`/`INACTIVE_LEAD_STATUSES`
(`lib/constants/lead-status.ts`), `normalizeLeadStatus` (`lib/rules/normalize-lead-status.ts`),
`candidateService.create` forced-field contract (promote creates the candidate — §4), the keyset
codec (`lib/validation/cursor.ts` `encodeCursor`/`decodeCursor`, `ListOrderBy`) + the
candidate list/filter/load-more pattern, `withTransaction`, `writeAudit`, `apiHandler`/`json`,
`requireUser`/`AuthUser`, `AppError`, the soft-delete-by-default repository pattern,
`userRepository.namesByIds`, and the UI primitives (`Modal`/`Table`/`Badge`/`Select`/`Field`/
`EmptyState`/`ErrorState`/`Spinner`) + Tailwind tokens. The nav model (`lib/nav.ts`).

---

## Headline decisions

| # | Decision |
|---|----------|
| **L-1** | **`status` is stored as the canonical `LeadStatus` LABEL STRING** (`"Sourced"`, `"Outreach 1"`, …), validated against `LEAD_STATUSES` and canonicalized with `normalizeLeadStatus` on every write. Leads have **no numeric stage codes / ordinal** like the pipeline (their order is intrinsic to the small enum), so inventing `LEAD_*` codes + a `stage_order` mirror buys nothing and diverges from how the constant already ships. Consistent with how candidate status began (label) before the pipeline's ordinal was needed for gates/funnels — leads have neither gates nor a numeric funnel. |
| **L-2** | **The outreach state machine is a PURE, isomorphic module** (`src/lib/rules/lead-lifecycle.ts`, no `server-only`) — `advanceOnOutreach`, `setResponse`, `canPromote`, `canLogOutreach`. Server-authoritative: the service is the only writer, but the pure rule is unit-testable and the client reuses it to disable dead actions. |
| **L-3** | **`outreach_attempts` is ONE table with a nullable `leadId` AND a nullable `candidateId`** (per DECISIONS + DATA-MODEL) — this slice writes only `leadId`; the `candidateId` column exists so `candidate_log_outreach` (later) shares the table with no migration. |
| **L-4** | **`outreachCount` is denormalized on the lead** (+ `lastOutreachAt`) — the inventory shows an attempt count + recency per row with **no N+1** and no re-parsing (fixes the legacy `OutreachAttempts` JSON-string re-parse perf sink). The count is the TRUE number of attempts (unbounded); STATUS advancement caps at `Outreach 3 (Final)` — the two are deliberately decoupled. |
| **L-5** | **Promote does candidate-create + lead-mark in ONE `withTransaction`.** A hot lead → a Candidate forced to `NEW_CANDIDATE` (stage 0, `createdById = user.id`) via the reused create contract, then `lead.status = "Promoted"` + `promotedCandidateId` set, then audit — atomic, so a lead can never read "Promoted" while pointing at a candidate that failed to write (or vice-versa). **Terminal + idempotent-guarded:** an already-Promoted or soft-deleted lead throws (no double-promote). |
| **L-6** | **Promote field-mapping goes through a pure `leadToCandidateInput(lead)` helper that COERCES free-text lead fields to the candidate's strict vocab.** A lead's `credential` is a raw job title and `state` is free text; the candidate columns are validated against `CREDENTIALS`/`US_STATES`. The helper passes a value through **only if it matches the enum** (via the existing guards), else drops it to `null` — so promote never injects invalid vocabulary that the pipeline gates/scorer would choke on. |
| **L-7** | **AuthZ = `requireUser()` (any signed-in operator)** for every lead route — matches the candidate-pipeline authZ model (Screener/Associate are the primary sourcing workers and hold no capabilities). No lead-specific capability in v1 (a future `manageLeads` capability is noted, not built). |
| **L-8** | **Mutations re-pull via `router.refresh()`** (the `/sourcing` page is RSC-seeded); no optimistic layer / TanStack Query in this slice. Sourcing is low-frequency (not a drag-heavy kanban), so a server re-render after each action is correct and simplest. Promote instead **navigates to the new `/candidates/[id]`**. Optimistic + 30s-undo is deferred (§9). |
| **L-9** | **Small constants additions:** `"source_lead"` → `AUDIT_ENTITIES`; `"log_outreach"`, `"respond"`, `"promote"` → `AUDIT_ACTIONS` (+ label/tone). These are free-form `String` columns, but adding them to the union gives the Activity-Log view proper labels/filters instead of the humanized fallback. `leadStatusTone(status): BadgeTone` added to `lead-status.ts` (isomorphic). |

---

## 1. Prisma models

Added to `prisma/schema.prisma` (new migration `add_source_leads`). Both follow the existing house
style: vocab stored as `String`/`String[]` (validated in zod against `lib/constants` unions — no
enum migrations), actor columns plain `String` ids, soft-delete filtered at the repository layer,
`legacyId? @unique` for the deferred ETL upsert.

```prisma
// --- Sourcing (Wave 2.6) ---
// Pre-pipeline lead funnel. `status` is the canonical LeadStatus LABEL (L-1), validated in zod vs
// LEAD_STATUSES and canonicalized with normalizeLeadStatus on write — no numeric stage code (leads
// have no gates/ordinal funnel). Promote creates a Candidate in Postgres (D2) and back-links it.
model SourceLead {
  id       String  @id @default(cuid())
  legacyId String? @unique // deferred ETL backfill (idempotent upsert)

  // identity / contact (PII)
  name        String
  email       String?
  phone       String?
  linkedinUrl String?

  // sourcing context (free text — NOT the candidate strict-vocab enums)
  credential String? // raw job title / credential text
  state      String?
  source     String?
  tags       String[] @default([])
  notes      String?
  clientId   String?  @relation-target // TargetClient — nullable FK (see below)

  // lifecycle status + denormalized outreach (L-4)
  status         String    @default("Sourced") // a LeadStatus LABEL
  outreachCount  Int       @default(0)          // TRUE attempt count (unbounded; status caps at O3)
  lastOutreachAt DateTime?
  respondedAt    DateTime?

  // promote back-link (set once, on promote)
  promotedCandidateId String?    @unique
  promotedCandidate   Candidate? @relation("LeadPromotion", fields: [promotedCandidateId], references: [id], onDelete: SetNull)

  // target client (optional) — reuses the small clients table for the promote → candidate.clientId carry
  client Client? @relation("LeadTargetClient", fields: [clientId], references: [id], onDelete: SetNull)

  // lifecycle
  createdById String?
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
  deletedAt   DateTime?
  deletedById String?

  outreachAttempts OutreachAttempt[]

  @@index([status])
  @@index([deletedAt])
  @@index([email]) // dedupe/search
  @@index([clientId])
  @@index([deletedAt, createdAt, id]) // keyset list (createdAt_desc, id tiebreak)
  @@map("source_leads")
}

// ONE table for BOTH lead and candidate outreach (L-3). This slice writes leadId only; candidateId
// exists for candidate_log_outreach later (no migration then). Cascade on both FKs: an attempt is a
// child of whichever entity owns it and is destroyed with a hard purge of that parent.
model OutreachAttempt {
  id       String  @id @default(cuid())
  legacyId String? @unique // deferred ETL (splits the legacy OutreachAttempts JSON blob into rows)

  leadId String?
  lead   SourceLead? @relation(fields: [leadId], references: [id], onDelete: Cascade)

  candidateId String?
  candidate   Candidate? @relation(fields: [candidateId], references: [id], onDelete: Cascade)

  channel String // email | phone | linkedin | other (validated vs OUTREACH_CHANNELS in zod)
  at      DateTime @default(now())
  note    String?
  actorId String

  createdAt DateTime @default(now())

  @@index([leadId])
  @@index([candidateId])
  @@index([actorId, at]) // DECISIONS: outreach_attempts(actor, day) — the CRM/daily-log perf index
  @@map("outreach_attempts")
}
```

> **Schema notes.** (1) `@relation-target` above is shorthand — `clientId` is a plain nullable
> column with the two named relations spelled out (`LeadTargetClient`, `LeadPromotion`); the
> implementer wires the actual Prisma relation syntax. (2) `Candidate` gains two back-relations:
> `promotedFromLead SourceLead? @relation("LeadPromotion")` and
> `outreachAttempts OutreachAttempt[]`, and `Client` gains
> `sourceLeads SourceLead[] @relation("LeadTargetClient")`. (3) **No `snoozedUntil` column** — snooze
> is deferred (§9); it lands with that slice. (4) `promotedCandidateId @unique` enforces one lead →
> at most one promoted candidate at the DB level.

**Constants (new — `src/lib/constants/lead-status.ts`, extend):**

```ts
export const OUTREACH_CHANNELS = ["email", "phone", "linkedin", "other"] as const;
export type OutreachChannel = (typeof OUTREACH_CHANNELS)[number];
export function isOutreachChannel(v: string): v is OutreachChannel { /* includes-check */ }

// Badge tone per lead status (L-9) — isomorphic, tones limited to the Badge union.
export const LEAD_STATUS_TONE: Record<LeadStatus, BadgeTone> = {
  "Sourced": "neutral",
  "Outreach 1": "navy",
  "Outreach 2": "navy",
  "Outreach 3 (Final)": "amber",
  "Responded — Hot": "success",
  "Responded — Cold": "neutral",
  "No Response": "danger",
  "Bad Fit": "danger",
  "Future Collaboration": "neutral",
  "Promoted": "success",
};
export function leadStatusTone(status: string): BadgeTone {
  return isLeadStatus(status) ? LEAD_STATUS_TONE[status] : "neutral";
}
```

---

## 2. The outreach state machine (pure) — `src/lib/rules/lead-lifecycle.ts`

The core domain rule. **Pure + isomorphic** (no `server-only`) so it is unit-tested in isolation and
the client reuses it to disable dead actions. The service (§3) is the sole *writer*; this module only
computes the next legal state.

**States** (from `LEAD_STATUSES`):

| Group | Statuses |
|-------|----------|
| **Active outreach** | `Sourced`, `Outreach 1`, `Outreach 2`, `Outreach 3 (Final)` |
| **Responded** | `Responded — Hot`, `Responded — Cold` |
| **Closed (manual, out of scope to set this slice)** | `No Response`, `Bad Fit`, `Future Collaboration` |
| **Terminal (system)** | `Promoted` |

**Transitions this slice implements:**

| Action | From | To | Notes |
|--------|------|-----|-------|
| **Log outreach** | `Sourced` | `Outreach 1` | `advanceOnOutreach` |
| | `Outreach 1` | `Outreach 2` | |
| | `Outreach 2` | `Outreach 3 (Final)` | |
| | `Outreach 3 (Final)` | `Outreach 3 (Final)` | **cap** — status holds; `outreachCount` still increments |
| | `Responded — Hot/Cold` | *(unchanged)* | attempt recorded, status HELD (you can keep chasing a responded lead) |
| | `Promoted` / soft-deleted | — | **rejected** (`CONFLICT`) — lead handed off / gone |
| **Respond Hot** | any active or responded (non-`Promoted`, non-deleted) | `Responded — Hot` | `setResponse`; sets `respondedAt` if not already responded; re-settable Hot↔Cold |
| **Respond Cold** | ″ | `Responded — Cold` | |
| **Promote** | any non-`Promoted`, non-deleted | `Promoted` | `canPromote`; terminal; set by the promote service only |
| **Soft-delete** | any live | *(unchanged status)* + `deletedAt` | reversible; not a status transition |

```ts
/** Next status after logging an outreach attempt. Advances through the 3 outreach stages, caps at
 *  Outreach 3, and HOLDS status for a responded lead (attempt still counts). Returns the SAME status
 *  when no advance applies; the caller rejects Promoted/deleted before calling (canLogOutreach). */
export function advanceOnOutreach(status: LeadStatus): LeadStatus {
  switch (status) {
    case "Sourced": return "Outreach 1";
    case "Outreach 1": return "Outreach 2";
    case "Outreach 2": return "Outreach 3 (Final)";
    default: return status; // Outreach 3 (cap) + responded/closed hold
  }
}
export function canLogOutreach(status: LeadStatus): boolean { return status !== "Promoted"; }
export function setResponse(kind: "hot" | "cold"): LeadStatus {
  return kind === "hot" ? "Responded — Hot" : "Responded — Cold";
}
export function canRespond(status: LeadStatus): boolean { return status !== "Promoted"; }
export function canPromote(status: LeadStatus): boolean { return status !== "Promoted"; }
```

*(Soft-delete + not-found are the service's row-level guards; the pure module only reasons about the
`status` value, never about `deletedAt`.)*

---

## 3. Server layer — repository + service + DTOs

### 3.1 `leadRepository` (`src/server/repositories/lead.repository.ts`)

The only layer that touches Prisma for leads. **Soft-delete enforced here** (mirrors
`candidateRepository`): reads add `deletedAt: null` unless `includeDeleted`. Every method takes an
optional `tx`. Keyset uses the shared `cursor.ts` codec with `orderBy: "createdAt_desc"` (lead rows
satisfy `CursorSource` via `createdAt`/`id`).

| Method | Purpose |
|--------|---------|
| `create(data, tx?)` | insert a lead |
| `findById(id, { includeDeleted? }, tx?)` | single row (excludes deleted by default) |
| `list(filters, tx?)` | keyset page — `where` from `buildLeadWhere` (status/source/search/soft-delete) + `[createdAt, id]` order + keyset predicate + `take` |
| `count(filters, tx?)` | true filtered total (list denominator) |
| `update(id, data, tx?)` | patch (status/outreach denorm/promote back-link/soft-delete fields) |
| `softDelete(id, actorId, tx?)` | set `deletedAt`/`deletedById` |
| `findByEmail(email, tx?)` | dedupe lookup (used by ETL later; §4 dedupe note) |
| `findByLegacyId` / `upsertByLegacyId` | ETL-only, delete-agnostic (deferred) |
| `attemptRepository.add(data, tx?)` | insert an `OutreachAttempt` (or fold into `leadRepository.addAttempt`) |

`buildLeadWhere(filters)`: `deletedAt: null` (unless `includeDeleted`); `status` equality;
`source` equality; `search` → `OR[{ name contains }, { email contains }]` (insensitive), AND-merged
so it never clobbers the keyset OR (same shape as `buildCandidateWhere`).

### 3.2 `leadService` (`src/server/services/lead.service.ts`)

Owns authZ + the DTO shape + the state-machine writes; never touches Prisma directly.

```ts
export const leadService = {
  async create(input: CreateLeadInput, user: AuthUser): Promise<LeadDetailDTO>,
  async list(filters: LeadListFilters, viewer: AuthUser): Promise<LeadListDTO>,
  async getDetail(id: string, viewer: AuthUser): Promise<LeadDetailDTO>,      // (RSC/detail; attempts + notes)
  async logOutreach(id: string, input: LogOutreachInput, user: AuthUser): Promise<LeadDetailDTO>,
  async setResponse(id: string, kind: "hot" | "cold", user: AuthUser): Promise<LeadDetailDTO>,
  async promote(id: string, user: AuthUser): Promise<{ candidateId: string; lead: LeadDetailDTO }>,
  async softDelete(id: string, user: AuthUser): Promise<{ id: string }>,
};
```

**`create`** — `requireUser` at the route; `user` forwarded. `status` is forced to
`normalizeLeadStatus(input.status ?? "Sourced")` (a create can't drop a lead mid-funnel by hand);
`outreachCount: 0`; `createdById = user.id`. Audited (`create`) — the insert + `writeAudit` in one
`withTransaction`.

**`logOutreach`** — load `findById` (missing → `NOT_FOUND`). Guard `canLogOutreach(status)` (else
`CONFLICT` "Lead already promoted"). Compute `next = advanceOnOutreach(status)`. In ONE
`withTransaction`: (1) `attemptRepository.add({ leadId: id, channel, note, at, actorId: user.id })`;
(2) `leadRepository.update(id, { status: next, outreachCount: { increment: 1 }, lastOutreachAt: at })`;
(3) `writeAudit(action: "log_outreach", before: { status, outreachCount }, after: { status: next,
channel })`. `channel` validated `isOutreachChannel` at the route; `at` defaults to `now`.

**`setResponse`** — load; guard `canRespond` (else `CONFLICT`). `next = setResponse(kind)`. Txn:
`update(id, { status: next, respondedAt: existing.respondedAt ?? now })` + `writeAudit("respond",
{ status } → { status: next })`.

**`promote`** — see §4 (the load-bearing one).

**`softDelete`** — load `findById` (missing OR already-trashed → `NOT_FOUND`, the idempotency guard,
mirrors candidate). Txn: `softDelete(id, user.id)` + `writeAudit("delete", { deletedAt: null } →
{ deletedAt, deletedById, status })`. Reversible; **undelete/30s-undo deferred** (§9).

### 3.3 DTOs (`src/lib/validation/lead.ts` — isomorphic types + zod, no server imports)

```ts
export interface LeadListItemDTO {
  id: string;
  name: string;              // PII — /sourcing is auth-gated (OK)
  email: string | null;      // contact shown in the inventory (like the legacy lead table)
  phone: string | null;
  credential: string | null; // raw title
  state: string | null;
  source: string | null;
  status: LeadStatus;
  outreachCount: number;
  lastOutreachAt: string | null; // ISO
  targetClientName: string | null;
  promotedCandidateId: string | null; // present once promoted → row links to the candidate
  createdAt: string; // ISO
}
export interface LeadListDTO { leads: LeadListItemDTO[]; count: number; hasMore: boolean; nextCursor: string | null; total: number; }

export interface OutreachAttemptDTO { id: string; channel: OutreachChannel; at: string; note: string | null; actorId: string; actorName: string | null; }
export interface LeadDetailDTO extends LeadListItemDTO {
  linkedinUrl: string | null;
  tags: string[];
  notes: string | null;
  respondedAt: string | null;
  attempts: OutreachAttemptDTO[]; // newest-first; actorName via userRepository.namesByIds
}
```

`toLeadListItem(row, clientNames)` / `toLeadDetail(row, attempts, clientNames, actorNames)`. Leads
carry **no `licenseNumber`-class PII**, so there is no `viewCredentials` gate on the projection —
but the surface is still behind auth. `list` resolves `targetClientName` from a one-shot
`clientRepository.list()` `id→name` map (as the candidate reads do); detail resolves attempt
`actorName` via a **single** `userRepository.namesByIds` batch (no N+1).

---

## 4. Promote → Candidate (L-5, L-6)

The hand-off that makes the funnel one store (D2). `promote(id, user)`:

1. `existing = leadRepository.findById(id)` — missing/soft-deleted → `NOT_FOUND`.
2. Guard `canPromote(existing.status)` — already `Promoted` → `CONFLICT` "Lead already promoted".
   (The `@unique promotedCandidateId` is the DB backstop against a race.)
3. `input = leadToCandidateInput(existing)` — the **pure coercing mapper** (§4.1).
4. **One `withTransaction`:**
   a. Create the candidate with the **reused forced-field contract** (status `NEW_CANDIDATE`,
      `stageOrder 0`, `createdById = user.id`) — inside `tx` (see §4.2).
   b. `leadRepository.update(id, { status: "Promoted", promotedCandidateId: candidate.id }, tx)`.
   c. `writeAudit(tx, { entity: "source_lead", entityId: id, action: "promote",
      before: { status: existing.status }, after: { status: "Promoted", candidateId: candidate.id } })`.
   d. *(Recommended, OQ-2)* also `writeAudit(entity: "candidate", entityId: candidate.id,
      action: "create", after: { source: "promoted_lead", leadId: id })` — so the new candidate has a
      creation trail (interactive `candidateService.create` currently writes none).
5. Return `{ candidateId: candidate.id, lead: toLeadDetail(...) }`. The client navigates to
   `/candidates/{candidateId}`.

### 4.1 `leadToCandidateInput(lead)` — pure mapper (`src/server/services/lead.promote-map.ts`, or a pure `lib/` helper)

Coerces free-text lead fields to the candidate's **strict vocab** using the existing guards; anything
that doesn't match drops to `null` (never injects invalid vocabulary the pipeline gate/scorer relies
on). Unit-tested.

| Candidate field | From lead | Coercion |
|-----------------|-----------|----------|
| `name` | `name` | required (guaranteed non-empty on a lead) |
| `email` | `email` | pass-through |
| `phone` | `phone` | pass-through |
| `state` | `state` | `isUsState(state) ? state : null` |
| `credential` | `credential` | `isCredential(credential) ? credential : null` (raw title otherwise dropped — OQ-3: optionally carried into a candidate note) |
| `source` | `source`/constant | a `SOURCES` value for sourced leads if one exists, else `null` (confirm the vocab — OQ-3) |
| `clientId` | `clientId` (TargetClient) | pass-through (already a real Client FK) |
| `tags` | `tags` | filter to valid `TAGS` members |
| `track` | — | **`"Clinical"`** (matches `candidateService.create` default). Deriving `Operations` from credential/contact-only is a follow-up (OQ deferred). |
| `status`/pipeline/license/verification | — | **NOT mapped** — owned by the create contract / `move` / `verify-license`. |

`legacyId` is **not** copied (different entity namespace); the candidate gets its own id and, later,
its own `legacyId` from the candidate ETL.

**Dedupe:** the slice **creates the candidate unconditionally** even if `lead.email` matches an
existing candidate. Cross-entity email-dedupe (merge/flag) is owned by the multi-entity ETL
(DECISIONS "email-primary dedupe") — a `leadRepository.findByEmail`/candidate lookup + a warn/flag is
the follow-up. Flagged **OQ-4**.

### 4.2 Reusing `candidateService.create` inside the transaction (OQ-1)

`candidateService.create(input)` today: calls `requireUser()` itself, forces
`NEW_CANDIDATE`/`stageOrder 0`/`createdById`, calls `candidateRepository.create` — but it is **not
`tx`-aware** and writes **no audit**. Promote needs the candidate insert to be **atomic with the lead
update**. Two options — **recommend (A):**

- **(A) Make `create` composable** — change the signature to
  `create(input, user: AuthUser, tx?: Prisma.TransactionClient)`, keeping the forced-field contract
  in that one place. Promote passes its `tx` + `user`. The existing `POST /api/candidates` route
  passes the route's `requireUser()` result (tiny call-site change). The forced-field contract stays
  single-sourced. *(Preferred — one owner of "an interactive create starts at stage 0".)*
- **(B) Promote calls `candidateRepository.create` directly** inside its `withTransaction`, replicating
  the three forced fields (`status: "NEW_CANDIDATE"`, `stageOrder: statusOrder("NEW_CANDIDATE")`,
  `createdById: user.id`). No change to `create`, but the forced-field contract is now duplicated in
  two places.

Recommend **(A)**; either way the "create starts New, never mid-pipeline" invariant is preserved and
promote stays atomic.

---

## 5. Routes

All `apiHandler`-wrapped, `requireUser()` (L-7), zod-validated boundary, uniform
`{ error: { code, message } }` envelope. Bodies validated with schemas in `lib/validation/lead.ts`.

| Route | Method | Body / query | Service | Success |
|-------|--------|--------------|---------|---------|
| `/api/leads` | `POST` | `addLeadSchema` (name req; email/phone/linkedin/credential/state/source/tags/notes/clientId optional) | `leadService.create` | `201 { lead: LeadDetailDTO }` |
| `/api/leads/list` | `GET` | `status?`, `source?`, `search?`, `cursor?` (malformed → 400) | `leadService.list` | `200 LeadListDTO` |
| `/api/leads/[id]/outreach` | `POST` | `logOutreachSchema` (`channel` ∈ `OUTREACH_CHANNELS`, `note?`, `at?`) | `leadService.logOutreach` | `200 { lead: LeadDetailDTO }` / `409 CONFLICT` (promoted) / 404 |
| `/api/leads/[id]/respond` | `POST` | `respondSchema` (`kind: "hot"\|"cold"`) | `leadService.setResponse` | `200 { lead }` / 409 / 404 |
| `/api/leads/[id]/promote` | `POST` | — | `leadService.promote` | `200 { candidateId, lead }` / `409` (already promoted) / 404 |
| `/api/leads/[id]` | `DELETE` | — | `leadService.softDelete` | `200 { id }` / 404 |

The `/sourcing` **first page** is rendered by the RSC calling `leadService.list({}, user)` directly
(SSR, no fetch flash — mirrors `/candidates`); `/api/leads/list` serves the **load-more** keyset
pages. `list` route decodes the opaque `cursor` with `decodeCursor(cursor, "createdAt_desc")` →
`BAD_REQUEST` if malformed (same as the candidate list route).

**Deferred routes (not built here, §9):** `POST /api/leads/bulk-import` (chunked),
`POST /api/leads/bulk-action`, `POST /api/leads/[id]/snooze`, `POST /api/leads/[id]/undelete`,
`PATCH`/`DELETE` on an individual outreach attempt.

---

## 6. List / filters / pagination

- **Keyset cursor**, reusing `cursor.ts` — default `createdAt_desc` (Newest first). `list` fetches
  `PAGE + 1` rows to compute `hasMore`; `nextCursor = encodeCursor(lastRow, "createdAt_desc")`;
  `total` = `leadRepository.count(filters)` for an honest "Showing N of M". `PAGE = 50` (as the
  candidate list).
- **Filters** (server-authoritative, in the URL `searchParams` per DECISIONS — shareable, not
  localStorage): `status` (a `LeadStatus`), `source`, `search` (name/email). `INACTIVE_LEAD_STATUSES`
  is available to offer an "active only" default view (recommend the inventory defaults to **all**,
  with a one-click "Hide closed" toggle mapping to a status filter — small, optional).
- Denormalized `outreachCount` + `lastOutreachAt` mean the inventory renders attempt count/recency
  with **no per-row query** (L-4).

---

## 7. UI — `/sourcing`

```
src/app/(app)/sourcing/page.tsx           (RSC) getCurrentUser()→redirect if null; leadService.list({},user) → <LeadsInventory initial=… />
  └─ leads-inventory.tsx                    ("use client") base state from initial; filters; load-more; row actions
       ├─ lead-filters.tsx                  status <Select> + source <Select> + search <input> → URL searchParams
       ├─ leads-table.tsx                   <Table>: Name · Contact · Status <Badge> · Outreach · Last outreach · Source · ⋯actions
       ├─ add-lead-modal.tsx               <Modal> react-hook-form + zodResolver(addLeadSchema) → POST /api/leads
       ├─ log-outreach-modal.tsx           <Modal> quick action: channel <Select> + note <Textarea> → POST …/outreach
       ├─ promote-confirm.tsx              <Modal> confirm → POST …/promote → toast + router.push(`/candidates/${candidateId}`)
       └─ lib/lead-fetch.ts                fetch helpers + error-envelope → user message (mirrors the candidate list-fetch)
```

- **Table columns:** Name (prominent) · Contact (email/phone) · **Status** `Badge` toned via
  `leadStatusTone` · **Outreach** count (+ `lastOutreachAt` relative) · Source · a `⋯` action menu.
  Once a row is `Promoted`, its status badge links to `/candidates/{promotedCandidateId}`.
- **Add lead** — a header button opens `add-lead-modal` (`react-hook-form + zodResolver`,
  per the Wave-0 FE baseline). On success → `router.refresh()`, close, toast.
- **Log outreach** — a per-row quick action opening `log-outreach-modal` (channel + optional note).
  On success the status advances server-side; `router.refresh()` re-pulls the row (new
  status/count/recency). Disabled when `canLogOutreach(status) === false` (Promoted) — the pure rule
  drives the disabled state (L-2).
- **Respond Hot / Cold** — two items in the row action menu → `POST …/respond`. Disabled when
  `canRespond === false`.
- **Promote** — action → `promote-confirm` modal (explains "creates a candidate in the pipeline") →
  on success toast + **navigate to the new `/candidates/{candidateId}`**. Disabled when
  `canPromote === false`.
- **Soft-delete** — action → confirm → `DELETE /api/leads/[id]` → `router.refresh()`, toast.
- **Async/empty states:** RSC first paint (no loading flash); `EmptyState` when no leads match;
  `ErrorState` + toast on a failed mutation (Sonner, already global). `Spinner` on load-more.
- **Nav:** add `{ href: "/sourcing", label: "Sourcing" }` to `BASE_NAV_ITEMS` (`lib/nav.ts`) — a base
  item (open to every operator, no capability gate). Place it near Pipeline/Candidates (recommend
  after "Pipeline", before "Candidates", reflecting the find→promote→pipeline order).

---

## 8. Tests (Vitest; mock repositories/service — no DB)

Per DECISIONS/CONVENTIONS: **mandatory** for the rules engine + every authZ-fail route case;
best-effort elsewhere.

**Pure state machine (`lead-lifecycle.test.ts`) — MANDATORY:**
- `advanceOnOutreach`: `Sourced→O1→O2→O3(Final)`; `O3(Final)→O3(Final)` (**cap**); responded/closed
  status HELD.
- `canLogOutreach`/`canRespond`/`canPromote`: `false` only for `Promoted`.
- `setResponse("hot"|"cold")` → the two responded labels.

**`leadToCandidateInput` mapper (MANDATORY):** free-text `credential`/`state`/`tags` that don't match
`CREDENTIALS`/`US_STATES`/`TAGS` → coerced to `null`/filtered; valid ones pass; `track === "Clinical"`;
no pipeline/status/license fields leak into the input.

**`leadService`:**
- `promote`: creates a candidate (mock `create`/repo) forced to `NEW_CANDIDATE`; sets lead
  `status: "Promoted"` + `promotedCandidateId`; writes the `promote` audit; **all in one
  transaction** (assert a single `withTransaction`). **Double-promote** guarded → `CONFLICT`.
  Soft-deleted/missing → `NOT_FOUND`.
- `logOutreach`: advances status per the machine, **increments `outreachCount`**, sets
  `lastOutreachAt`, adds the attempt + audit in one txn; at `Outreach 3 (Final)` status **holds** but
  count still increments; `Promoted` → `CONFLICT`.
- `setResponse`: sets status + `respondedAt` (once); `Promoted` → `CONFLICT`.
- `list`: filters (status/source/search) forwarded to the repo; `hasMore`/`nextCursor` derived from
  `PAGE+1`; `targetClientName` resolved from the client map.
- `softDelete`: sets `deletedAt`/`deletedById` + audit; missing/already-trashed → `NOT_FOUND`.

**Routes (each has a 401 test):**
- `POST /api/leads`: 401; 201 happy; bad body → 422 (zod).
- `GET /api/leads/list`: 401; 200 page; malformed `cursor` → 400.
- `POST /api/leads/[id]/outreach`: 401; 200 advance; invalid `channel` → 422; promoted → 409; 404.
- `POST /api/leads/[id]/respond`: 401; 200; bad `kind` → 422; 409; 404.
- `POST /api/leads/[id]/promote`: 401; 200 `{ candidateId }`; already-promoted → 409; 404.
- `DELETE /api/leads/[id]`: 401; 200; 404.

---

## 9. Deferred (called out, NOT designed deeply — follow-up slices)

Per the task scope + IMPLEMENTATION-PLAN §2.6:
- **ETL backfill of historical leads** from the Sheet — its own later slice, mirrors the candidate
  ETL: `legacyId` idempotent upsert, **email-primary dedupe** (name secondary/manual), keep-newest +
  flag merge, splitting the legacy `OutreachAttempts` JSON blob into `outreach_attempts` rows, and a
  Sheet read-only freeze at final backfill. The `legacyId @unique` columns + `findByLegacyId`/
  `upsertByLegacyId` repo stubs are the seams left for it.
- **Bulk actions + 30s-undo** (`bulk-action`, `undelete`) and the **bulk-import** (chunked CSV/XLSX,
  `CHUNK=200`, header-alias + `normalizeLeadStatus`) routes.
- **Snooze** (`snoozedUntil` column + route + inventory "snoozed" affordance).
- **Edit / delete an individual outreach attempt** (`source_lead_edit_outreach` /
  `source_lead_delete_outreach`).
- **Undelete / restore** a lead (beyond the reversible soft-delete write itself).
- **Optimistic updates + TanStack Query** (this slice uses `router.refresh()`).
- **Candidate outreach** through `outreach_attempts` (`candidate_log_outreach`) — the `candidateId`
  column exists now; the candidate-side UI/route is a later wave.
- **Setting the manual closed statuses** (`No Response` / `Bad Fit` / `Future Collaboration`) — the
  storage + tones exist; the UI action is a small follow-up.
- The **full 5-modals-1:1** — this slice builds add-lead / log-outreach / promote; the rest defer.

---

## 10. Open questions / assumptions (flag — do not guess)

- **OQ-1 (recommend, needs a nod):** make `candidateService.create` composable
  (`create(input, user, tx?)`) so promote reuses the forced-field contract **inside** its transaction
  (§4.2 option A), vs. promote calling `candidateRepository.create` directly (option B, duplicates the
  contract). Recommend A.
- **OQ-2:** should promote also write a **candidate `create` audit** (interactive
  `candidateService.create` currently writes none)? Recommend yes (§4.4d) — a promoted candidate
  should have a creation trail.
- **OQ-3:** promote **field coercion** — dropping a non-enum `credential`/`state` to `null` (L-6). Is
  dropping acceptable, or should the raw job title be preserved (e.g. appended to a candidate note, or
  into `employer`)? Also: is there a `SOURCES` member for sourced leads to stamp `candidate.source`,
  or leave `null`? (Needs the `SOURCES` vocab checked.)
- **OQ-4:** **email dedupe on promote** — this slice creates the candidate unconditionally and leaves
  cross-entity dedupe to the ETL. Confirm it's acceptable that promoting a lead whose email already
  exists as a candidate creates a second candidate (flagged for the ETL merge).
- **OQ-5:** **TargetClient** modeled as a **nullable FK to `clients`** (`clientId`) — reused for the
  promote → `candidate.clientId` carry. Confirm vs. a free-text target-client string (legacy stored a
  raw label). If most legacy `TargetClient` values won't resolve to a seeded client, a nullable string
  + best-effort match at ETL may fit better.
- **OQ-6:** logging outreach on a **responded** lead — recommend **allowed, status held** (keep
  chasing), only `Promoted` rejects. Confirm this matches the recruiter workflow (vs. rejecting once
  responded).
- **OQ-7:** mutation refresh = **`router.refresh()`** (L-8) vs. an optimistic/local-state update.
  Recommend `router.refresh()` for this low-frequency surface; confirm.
- **Assumption:** the `(app)` segment has no shared auth layout, so `/sourcing/page.tsx` does its own
  `getCurrentUser()` → `redirect("/sign-in")` (mirrors `/candidates`, `/dashboard`).
- **Assumption:** leads carry no `licenseNumber`-class encrypted PII, so no field-crypto boundary and
  no `viewCredentials` gate on the lead DTO (contact fields show to any authed operator, as the legacy
  lead table did). The surface stays behind auth.
