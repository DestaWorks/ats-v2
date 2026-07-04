# Wave 2.2 + 2.3 — Candidate Detail (Module 4) Design — *first slice*

**Status:** design (architect). Backend/frontend implement the migration + routes + services + client detail
page + tests from this spec. **Design only — no implementation, no migration, no commit.** Conforms to
`DECISIONS.md` (wins on conflict), `IMPLEMENTATION-PLAN.md` §2.2–2.3, `DATA-MODEL.md`,
`STACK-ARCHITECTURE.md`, `CONVENTIONS.md`, `MODULE-BREAKDOWN.md` §6 (Candidate Detail Modal), and the
Wave 2.1 board (`docs/design/wave-2.1-pipeline.md`) it links from.

**Feature:** clicking a candidate card on the pipeline board opens a **full candidate profile** at
`/candidates/[id]` — the biggest visible gap. A demoable page with a header (name, credential/track,
client, current stage + a **stage-mover** reusing the existing move route), tabs **Details / License /
Résumé / Notes**, inline **edit** (PATCH profile fields), a **verify-license** action, a **résumé
list** (filename + `legacyUrl` + status; no byte preview), and **notes** (list + add, role-scoped
server-side, **XSS-safe** — fixes the legacy `dangerouslySetInnerHTML` stored-XSS). Ports
`legacy/index.html` ~9384–9527 (Module 4) 1:1 in behavior.

**Reuses (does NOT rebuild):** `candidateService.update`/`move`/`softDelete` (`update` already forbids
status/pipeline fields), `candidateRepository.findById`, `toCandidateDTO` (PII gate — `licenseNumber`
behind `viewCredentials`), `documentRepository.listByCandidate` + `toDocumentDTO` (gates
`extractedText`/`extractedData`), `stageHistoryRepository.listByCandidate`/`latest`, the move route
`POST /api/candidates/[id]/move` + the board's `ALL_STATUS_CODES`/`statusLabel`/`statusOrder`,
`checkStageGate`/`canTransition` (isomorphic), `stage-timing` (`getDaysInStage`), `apiHandler`/`json`/
`AppError`, `requireUser`/`requireCapability`, `withTransaction`, `writeAudit`, `lib/constants/*`
(CREDENTIALS/POPULATIONS/SETTINGS/LICENSE_STATUSES/TRACKS/SOURCES/TAGS/states/roles), the UI primitives
(`Button`/`Badge`/`Card`/`Field`/`Table`/`Spinner`/`EmptyState`/`ErrorState`) + `useZodForm`.

---

## Headline decisions

| # | Decision |
|---|----------|
| **D-1** | **One read entry point: `candidateService.getCandidateDetail(id, viewer)`** returns the PII-gated candidate + its `documents` + role-scoped `notes` + recent `stageHistory` + `clientName`, in a single `CandidateDetailDTO`. The RSC page loads it server-side (direct call, no self-fetch), mirroring the board page. §1. |
| **D-2** | **`candidate_notes` is a new table** (Wave 2.2 migration): two-value `noteType` enum (`internal`/`external`), soft-delete, `legacyId?` for the deferred ETL. Mentions are a **separate deferred model** — NOT in this slice. §2. |
| **D-3** | **XSS rule (binding):** note bodies are stored **raw** and rendered as **escaped plain text through React children** — **`dangerouslySetInnerHTML` is banned in the notes surface** (and everywhere note text flows). @mention highlighting is deferred; when it lands it renders mentions as React elements (tokenize → map), never as an HTML string. §3. |
| **D-4** | **Note visibility is filtered server-side in the read** (never client-side — the legacy bug shipped hidden notes to the browser). **v1 rule: every authenticated operator sees both `internal` and `external` notes.** The filter is a server function `visibleNotes(notes, viewer)` so a future client-portal viewer (external-only) is a one-line change. No new capability for the slice. §3.2. |
| **D-5** | **Edit = `PATCH /api/candidates/[id]` → `candidateService.update`** (profile fields only). **Status/pipeline timing stay owned by `move`; license *verification* fields (`licenseStatus`/`licenseExpiry`/`licenseVerifiedAt`/`licenseVerifiedById`) stay owned by `verify-license`.** `licenseNumber` is editable **only** by a viewer with `viewCredentials` (route rejects it otherwise). §4. |
| **D-6** | **`verify-license` is open to operators (`requireUser`)** — verifying is a real pipeline action and license status **drives the INITIAL_SCREENING / SUBMITTED gates**, so Screeners/Associates (who hold no capabilities) must be able to unblock the pipeline. Writing `licenseNumber` in the same call still requires `viewCredentials`. New `candidateService.verifyLicense` = txn (update + audit). §5. Flagged **OQ-2**. |
| **D-7** | **Notes = new `noteService` + `noteRepository`** (services own authZ + DTO; repos own Prisma). `POST /api/candidates/[id]/notes` (add, txn + audit) and `GET /api/candidates/[id]/notes` (role-scoped list). §6. |
| **D-8** | **`candidateService.update` gains an audit write** (wrap repo update + `writeAudit` in `withTransaction`, before/after snapshot) — today it writes none, and edit is an audited PII mutation. Small, contained change to an existing method. §4.1. Flagged **OQ-3**. |
| **D-9** | **Board card → detail** via a **"View profile" `Link` in the card footer** (outside the dnd-kit drag listeners, exactly like the existing move `<select>`), plus a `PointerSensor` activation distance so a card *name* `Link` could also work later. No drag/click ambiguity. §8. |

---

## 1. Read layer — `getCandidateDetail` + `CandidateDetailDTO` (D-1)

The page needs the candidate **plus** its documents, notes, and recent stage history — no existing method
returns that composite. Add a read method to `candidateService` (owns authZ + DTO shape; the route/RSC
never touch Prisma). It composes the existing repositories + DTOs.

### 1.1 `candidateService.getCandidateDetail(id, viewer)`

```ts
async getCandidateDetail(id: string, viewer: AuthUser): Promise<CandidateDetailDTO> {
  // authZ: caller already did requireUser()/getCurrentUser(); viewer drives the PII gate.
  const candidate = await candidateRepository.findById(id);          // deletedAt:null enforced in repo
  if (!candidate) throw new AppError("NOT_FOUND", "Candidate not found");

  const [documents, notes, history, clients] = await Promise.all([
    documentRepository.listByCandidate(id),
    noteRepository.listByCandidate(id),                              // §6 (excludes soft-deleted)
    stageHistoryRepository.listByCandidate(id),                     // desc by enteredAt
    clientRepository.list(),
  ]);
  const clientName = candidate.clientId
    ? (new Map(clients.map((c) => [c.id, c.name])).get(candidate.clientId) ?? null)
    : null;

  return {
    candidate: toCandidateDTO(candidate, viewer),                   // PII boundary: licenseNumber gated
    clientName,
    documents: documents.map((d) => toDocumentDTO(d, viewer)),      // gates extractedText/Data
    notes: visibleNotes(notes, viewer).map(toNoteDTO),             // §3.2 server-side scope
    stageHistory: history.slice(0, 10).map(toStageEventDTO),       // recent 10
    canVerifyCredentials: hasCapability(viewer.role, "viewCredentials"), // drives edit-of-licenseNumber UI
  };
}
```

- **PII never leaks:** `toCandidateDTO` omits `licenseNumber` unless `viewCredentials`; `toDocumentDTO`
  omits `extractedText`/`extractedData` unless `viewCredentials`. Both are existing boundaries — reused,
  not re-implemented.
- `canVerifyCredentials` is a UI hint only (whether to render the `licenseNumber` input); the **server
  routes re-enforce** it (D-5/D-6). Never trust the client.

### 1.2 DTO shapes (isomorphic — `src/lib/validation/candidate-detail.ts`)

Mirrors `lib/validation/pipeline.ts`: pure types + zod, no server imports, so the client imports the
same response/request shapes the server validates.

```ts
export interface StageEventDTO {
  id: string;
  fromStatus: string | null;
  toStatus: string;
  fromStageOrder: number | null;
  toStageOrder: number;
  enteredAt: string;   // ISO
  actorId: string;     // resolving actorId → name is deferred (OQ-5)
}

export interface NoteDTO {
  id: string;
  body: string;        // RAW text — the client renders it as ESCAPED plain text (D-3), never as HTML
  noteType: "internal" | "external";
  authorId: string;
  authorName: string | null;
  createdAt: string;   // ISO
}

export interface CandidateDetailDTO {
  candidate: CandidateDTO;          // from server candidate.dto (licenseNumber gated) — serialized
  clientName: string | null;
  documents: DocumentDTO[];         // metadata + legacyUrl + type; extractedText/Data gated
  notes: NoteDTO[];                 // already role-scoped server-side
  stageHistory: StageEventDTO[];    // recent 10, desc
  canVerifyCredentials: boolean;
}
```

> `CandidateDTO`/`DocumentDTO` are the server DTO row types; the wire versions have `Date` fields
> serialized to ISO strings by `Response.json`. The client type may alias them with `string` dates
> (define a `SerializedCandidateDTO` in the validation lib if strict typing is wanted — noted, not
> blocking).

---

## 2. `candidate_notes` Prisma model (Wave 2.2 migration) (D-2)

Lands in the backend phase as its own migration (`prisma migrate dev --name add_candidate_notes`).
Mirrors the `Candidate`/`Document` conventions: String-stored vocab validated in zod, soft-delete filtered
at the repo layer, `legacyId` for the deferred ETL, actor as a plain `String` id (matches
`activity_log.actor` / `stage_history.actorId` — legacy authors may not resolve to a `User` row).

```prisma
// Candidate notes (Wave 2.2). Body is user text — stored RAW and rendered as escaped plain text
// client-side (NEVER dangerouslySetInnerHTML — fixes the legacy stored-XSS). noteType is a two-value
// vocab (internal | external) validated in zod. Role-scoped visibility is enforced SERVER-SIDE in the
// read (server/services/note.service.ts), never shipped-then-hidden. Cascade: a note is candidate PII,
// so a hard purge takes its notes with it.
model CandidateNote {
  id          String    @id @default(cuid())
  legacyId    String?   @unique          // deferred ETL backfill (idempotent upsert)
  candidateId String
  candidate   Candidate @relation(fields: [candidateId], references: [id], onDelete: Cascade)

  authorId   String                        // acting user's id (mirrors activity_log.actor)
  authorName String?                        // denormalized display name (legacy notes may lack a User row)
  body       String                         // RAW user text — never rendered as HTML
  noteType   String    @default("internal") // internal | external (validated vs constant union in zod)

  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
  deletedAt   DateTime?
  deletedById String?

  @@index([candidateId])
  @@index([candidateId, createdAt])
  @@index([deletedAt])
  @@map("candidate_notes")
}
```

Add the back-relation on `Candidate`: `notes CandidateNote[]`.

**New constant** (`src/lib/constants/notes.ts`, exported from the barrel):

```ts
export const NOTE_TYPES = ["internal", "external"] as const;
export type NoteType = (typeof NOTE_TYPES)[number];
export function isNoteType(v: string): v is NoteType {
  return (NOTE_TYPES as readonly string[]).includes(v);
}
```

**Legacy mapping (for the deferred ETL, documented now):** legacy `NoteType` values
`internal`/`call`/`email`/`text` → `internal`; `client` → `external`. The 5-way type badge and
@mentions are **deferred** (§9).

---

## 3. XSS rule + note visibility (D-3, D-4)

### 3.1 Rendering rule (BINDING — the frontend cannot reintroduce the legacy XSS)

The legacy renders `n.Text.replace(/@(\w+)/, '<strong…>@$1</strong>')` into
`dangerouslySetInnerHTML` — a **stored XSS**: any candidate/teammate note containing `<img onerror=…>`
executes in every viewer's browser.

**Rule:**
1. Store the note body **raw** (no server-side HTML stripping/encoding — encoding is a *render* concern;
   double-encoding raw text corrupts it).
2. **Render as escaped plain text via React children** — `<p>{note.body}</p>`. React escapes text nodes,
   so no markup ever executes. **`dangerouslySetInnerHTML` is banned in `notes-tab.tsx` and any component
   that renders note text.** (Add an ESLint `react/no-danger` guard on the notes directory — noted.)
3. **Formatting:** none in this slice. When @mention highlighting lands (deferred), it **tokenizes** the
   raw string (`split(/(@\w+)/)`) and maps tokens to React `<span>`/`<strong>` elements — still React
   children, **never an HTML string**. Newlines preserved with CSS `whitespace-pre-wrap`, not `<br>`.

### 3.2 Server-side visibility (`visibleNotes`)

Legacy filtered notes **client-side** (`role==="admin" ? all : internal-only`) — hidden notes were still
shipped to the browser (a PII leak). The rebuild filters in the **read service** so a hidden note never
crosses the wire.

```ts
// server/services/note.service.ts (pure, testable)
export function visibleNotes(notes: NoteRow[], viewer: DtoViewer): NoteRow[] {
  // v1: every authenticated operator sees both internal + external (external = client-facing tone,
  // still internal-team-authored). The filter is centralized here so the future client-portal viewer
  // (external-only) is a one-line change — and it runs SERVER-SIDE, never trusting the client.
  return notes;
}
```

- **v1 = pass-through** for operators (all six roles are internal staff). No new capability needed.
- The seam is the point: when the client portal ships (Wave 8), add `if (viewer.isClientPortal) return
  notes.filter(n => n.noteType === "external")` here — the DTO/route/page never change.

---

## 4. Edit contract — `PATCH /api/candidates/[id]` (D-5, D-8)

**File:** `src/app/api/candidates/[id]/route.ts` (add `PATCH`).

**Editable fields** (profile only — the Details tab + track pill in legacy):

| Field | Notes |
|-------|-------|
| `name`, `email`, `phone`, `city`, `state`, `employer`, `yearsExp` | identity/contact |
| `credential`, `population`, `setting`, `track`, `source`, `tags` | clinical profile / gate inputs |
| `licenseState` | profile field (a gate input; NOT a verification field) |
| `clientId` | client assignment (SUBMITTED gate needs it) |
| `licenseNumber` | **GATED** — accepted **only** when the viewer has `viewCredentials`; rejected (`FORBIDDEN`) otherwise |

**Explicitly NOT editable here** (owned elsewhere, defense-in-depth): `status`, `stageOrder`,
`stageEnteredAt`, `placedAt` (→ `move`); `licenseStatus`, `licenseExpiry`, `licenseVerifiedAt`,
`licenseVerifiedById` (→ `verify-license`); `legacyId`, soft-delete columns, `createdById`.

**zod** (`src/lib/validation/candidate-detail.ts`):

```ts
export const candidateEditSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  email: z.string().trim().email().max(200).nullish(),
  phone: z.string().trim().max(50).nullish(),
  city: z.string().trim().max(120).nullish(),
  state: z.enum(US_STATES).nullish(),
  employer: z.string().trim().max(200).nullish(),
  yearsExp: z.number().int().min(0).max(80).nullish(),
  credential: z.enum(CREDENTIALS).nullish(),
  population: z.enum(POPULATIONS).nullish(),
  setting: z.enum(SETTINGS).nullish(),
  track: z.enum(TRACKS).optional(),
  source: z.enum(SOURCES).nullish(),
  tags: z.array(z.enum(TAGS)).max(20).optional(),
  licenseState: z.enum(US_STATES).nullish(),
  clientId: z.string().min(1).nullish(),
  licenseNumber: z.string().trim().max(100).nullish(),   // route strips unless viewCredentials
}).strict();  // reject unknown/forbidden keys (status, licenseStatus, …) → 422
export type CandidateEditInput = z.infer<typeof candidateEditSchema>;
```

**Route:**

```ts
export const PATCH = apiHandler<{ params: Promise<{ id: string }> }>(async (req, ctx) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  const input = candidateEditSchema.parse(await req.json());
  if (input.licenseNumber !== undefined && !hasCapability(user.role, "viewCredentials")) {
    throw new AppError("FORBIDDEN", "You don't have permission to edit the license number");
  }
  const updated = await candidateService.update(id, input, user);   // §4.1 (now audited)
  return json({ candidate: toCandidateDTO(updated, user) });        // re-gated on the way out
});
```

- `.strict()` means a client that tries to sneak `status`/`licenseStatus` in the body gets a 422 — the
  server never routes a pipeline/verification field through `update`.
- 200 `{ candidate }` (PII-re-gated), 404 (missing/soft-deleted), 401, 403 (licenseNumber w/o cap),
  422 (zod).

### 4.1 `candidateService.update` gains audit (D-8)

Today `update` is `findById` → `repository.update` with **no audit**. Edit is an audited PII mutation, so
wrap it (matching the `move` pattern):

```ts
async update(id: string, input: CandidateUpdateInput, user: AuthUser) {
  const existing = await candidateRepository.findById(id);
  if (!existing) throw new AppError("NOT_FOUND", "Candidate not found");
  return withTransaction(async (tx) => {
    const updated = await candidateRepository.update(id, input, tx);
    await writeAudit(tx, {
      entity: "candidate", entityId: id, actor: user.id, action: "update",
      before: pickAudited(existing, input),   // only the changed keys — before/after may hold PII
      after: pickAudited(updated, input),
    });
    return updated;
  });
}
```

- Signature gains `user` (the create/create-caller already pass it; the only other caller of `update`
  is `move`, which passes its own txn write separately — `move` writes the candidate via the repo
  directly, not via `service.update`, so it's unaffected). Confirm no other caller breaks — flagged
  **OQ-3**.
- `pickAudited` narrows the snapshot to the keys actually in `input` (audit stays small; never logs raw
  bodies — audit rows are `viewAudit`-gated, per `db/audit.ts`).

---

## 5. Verify-license — `POST /api/candidates/[id]/verify-license` (D-6)

**File:** `src/app/api/candidates/[id]/verify-license/route.ts`.

Ports legacy `ats_verify_license` (line 9469): sets `licenseStatus` (+ optional `licenseExpiry`,
`licenseNumber`) and stamps **who/when**. License status **drives the stage gates**
(`INITIAL_SCREENING` needs verified, `SUBMITTED_TO_CLIENT` needs `Active`), so this is a load-bearing
pipeline action — **open to operators** (`requireUser`), matching legacy. Writing `licenseNumber`
requires `viewCredentials`.

**zod:**

```ts
export const verifyLicenseSchema = z.object({
  licenseStatus: z.enum(LICENSE_STATUSES),         // "Not Verified" | "Active" | "Expired" | …
  licenseExpiry: z.coerce.date().nullish(),
  licenseNumber: z.string().trim().max(100).nullish(),  // route strips unless viewCredentials
}).strict();
export type VerifyLicenseInput = z.infer<typeof verifyLicenseSchema>;
```

**Service — new `candidateService.verifyLicense(id, input, user)`** (txn: update + audit):

```ts
async verifyLicense(id, input, user) {
  const existing = await candidateRepository.findById(id);
  if (!existing) throw new AppError("NOT_FOUND", "Candidate not found");
  const now = new Date();
  return withTransaction(async (tx) => {
    const updated = await candidateRepository.update(id, {
      licenseStatus: input.licenseStatus,
      ...(input.licenseExpiry !== undefined ? { licenseExpiry: input.licenseExpiry } : {}),
      ...(input.licenseNumber !== undefined ? { licenseNumber: input.licenseNumber } : {}),
      licenseVerifiedAt: now,
      licenseVerifiedById: user.id,
    }, tx);
    await writeAudit(tx, {
      entity: "candidate", entityId: id, actor: user.id, action: "verify_license",
      before: { licenseStatus: existing.licenseStatus, licenseExpiry: existing.licenseExpiry },
      after:  { licenseStatus: updated.licenseStatus, licenseExpiry: updated.licenseExpiry },
    });
    return updated;
  });
}
```

**Route:** `requireUser()` → reject `licenseNumber` w/o `viewCredentials` (same guard as PATCH) →
`verifyLicense` → `200 { candidate: toCandidateDTO(updated, user) }`. 404 / 401 / 403 / 422 as above.

> Note the gate direction: verify-license does **not** itself move the candidate — it only sets status.
> The recruiter then uses the stage-mover; the server gate re-reads the now-verified license. This keeps
> verification and movement as two audited actions (matches legacy).

---

## 6. Notes routes + service (D-7)

### 6.1 `noteRepository` (`src/server/repositories/note.repository.ts`)

The only layer touching Prisma for notes; soft-delete filtered by default; optional `tx`.

```ts
export type NoteRow = CandidateNote;
export interface NoteCreateData {
  candidateId: string; authorId: string; authorName?: string | null;
  body: string; noteType: string; legacyId?: string | null;
}
export const noteRepository = {
  create(data, tx?) { /* db(tx).candidateNote.create({ data }) */ },
  listByCandidate(candidateId, tx?) {
    // where: { candidateId, deletedAt: null }, orderBy: { createdAt: "desc" }
  },
  softDelete(id, actorId, tx?) { /* deletedAt/deletedById */ },
  upsertByLegacyId(legacyId, data, tx?) { /* deferred ETL — mirrors document repo */ },
};
```

### 6.2 `noteService` (`src/server/services/note.service.ts`) + `note.dto.ts`

- `visibleNotes(notes, viewer)` — §3.2 (pure).
- `toNoteDTO(row): NoteDTO` — projects the row (no PII gate needed; body is text, author is a name/id).
- `async add(candidateId, input, user)` — verify candidate exists (`candidateRepository.findById` — so a
  note can't attach to a missing/soft-deleted candidate), then txn: `noteRepository.create` +
  `writeAudit({ action: "add_note" })`. Returns `toNoteDTO(created)`.
- `async listByCandidate(candidateId, viewer)` — `noteRepository.listByCandidate` → `visibleNotes` →
  `map(toNoteDTO)`.

### 6.3 Routes (`src/app/api/candidates/[id]/notes/route.ts`)

```ts
// zod (candidate-detail.ts)
export const addNoteSchema = z.object({
  body: z.string().trim().min(1).max(5000),
  noteType: z.enum(NOTE_TYPES).default("internal"),
}).strict();

// POST — add
export const POST = apiHandler<{ params: … }>(async (req, ctx) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  const input = addNoteSchema.parse(await req.json());
  const note = await noteService.add(id, input, user);   // authorId=user.id, authorName=user.name
  return json({ note }, 201);
});

// GET — role-scoped list
export const GET = apiHandler<{ params: … }>(async (req, ctx) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  return json({ notes: await noteService.listByCandidate(id, user) });
});
```

- **Body is stored raw** (no HTML strip); the **XSS defense is at render** (D-3). zod caps length
  (5000) and requires non-empty.
- `authorId`/`authorName` come from the **server session** (`user.id`/`user.name`) — never the client
  body (legacy took `author` from the client). 201 on add, 200 on list, 401 on both, 404 if candidate
  missing.

---

## 7. Page / component tree

```
src/app/(app)/candidates/[id]/page.tsx        (RSC) getCurrentUser()→redirect; getCandidateDetail(id,user); <CandidateDetail initial=… viewer=…/>
  └─ candidate-detail.tsx                       ("use client") owns tab state + local candidate/notes state; ErrorState on load failure
       ├─ detail-header.tsx                      name; credential + licenseState + track badges (Badge); clientName; current-stage Badge
       │    └─ stage-mover.tsx                    reuses POST /:id/move (§7.1); shows blocked reasons
       ├─ detail-tabs.tsx                         ARIA tablist (Details / License / Résumé / Notes) — §7.5
       ├─ details-tab.tsx                         edit form via useZodForm(candidateEditSchema) → PATCH (§7.2)
       ├─ license-tab.tsx                         track-aware: Operations → "no license required" card; else verify form → POST verify-license (§7.3)
       ├─ resume-tab.tsx                          <Table> of documents: filename + status + "Open" (legacyUrl) — §7.4
       └─ notes-tab.tsx                            notes list (escaped text) + type toggle + composer → POST notes (§7.6)
  src/lib/validation/candidate-detail.ts          isomorphic DTOs + zod (edit/verify/add-note) — shared client+server
```

The page is an RSC that guards + loads server-side (mirrors `pipeline/page.tsx`); `CandidateDetail` is a
client component seeded from `initial` (SSR, no first-paint fetch). Mutations re-fetch the affected slice
or optimistically patch local state, then reconcile with the route response.

### 7.1 Stage-mover (reuse the move endpoint)

- Renders the current stage + a control to move: reuse the board's **"Move to…" `<select>`** pattern
  (every `ALL_STATUS_CODES`), or a labelled button group like legacy line 9426 — recommend the
  `<select>` for a11y parity with the card.
- On change: `fetch POST /api/candidates/${id}/move { toStatus }`.
  - **200** → patch local candidate `status`/`stageOrder`/`stageEnteredAt`; toast success; announce.
  - **422 STAGE_BLOCKED** → toast + inline error listing the blocking reasons (split the message on
    `"; "`, matching the board's handling of the same envelope). Candidate unchanged.
  - 404/401/500 → toast generic.
- **Optional client pre-check:** reuse `checkStageGate(toRuleCandidate-equivalent, toStatus)` to disable
  invalid options — but the detail DTO carries `population`/`setting`/`email`/`phone`? The gate needs
  `hasContact`; the **full** candidate DTO here *does* carry `email`/`phone` (unlike the board card), so a
  faithful client mirror is possible. Server stays authoritative. (Nice-to-have — flagged OQ-4.)

### 7.2 Details tab — edit form

- `useZodForm(candidateEditSchema)` seeded via `defaultValues` from the loaded candidate.
- `Field` wrappers for each control; `<select>` for enum fields (CREDENTIALS/POPULATIONS/SETTINGS/TRACKS/
  SOURCES/states), text inputs for contact, a tags multi-select (or comma input → array).
- **`licenseNumber` input rendered only when `initial.canVerifyCredentials`** (server also enforces).
- Read-only meta (Added by, Added date, Source) shown as `Card` rows.
- Submit → `PATCH /api/candidates/${id}` with the dirty fields; 200 → patch local + toast; 403/422 →
  field/toast errors from the envelope (`issues` → `form.setError`).
- **Track is edit-only in Details** for this slice (the standalone track-editor pill is deferred — §9).

### 7.3 License tab (track-aware, ports legacy 9457–9469)

- `track === "Operations"` → a green "✓ No license required" `Card` (no form).
- Else → current status card (dot color by status: Active=green/Expired=red/else=orange), expiry,
  license # (only if `canVerifyCredentials`), "Verified by … " line (from `licenseVerifiedById`/`At`), a
  **state-board verify link** (reuse the `states` constant's board URL if present, else omit — the URL map
  lives in legacy `BOARDS`; porting it is a small follow-up), and the **verify form**: status `<select>`
  (LICENSE_STATUSES) + expiry date + license # (gated) → `POST /:id/verify-license`.
- On success: patch local candidate license fields; toast; note the stage-mover may now allow a
  previously-blocked move.

### 7.4 Résumé tab (list only — byte preview deferred to W6)

- `initial.documents` in a `<Table caption="Résumé documents" columns={["File","Type","Status","Uploaded",""]}>`.
- Each row: `originalFilename`; `type` (Badge); a **status** column derived from `storageKey`/`legacyUrl`
  (`storageKey` → "Stored" / `legacyUrl` only → "Legacy link" / neither → "Metadata only"); `createdAt`;
  and an **"Open" link** to `legacyUrl` (`target="_blank" rel="noopener noreferrer"`) when present.
- **No iframe / byte preview** (legacy Drive iframe) — deferred to Wave 6 storage. `EmptyState` when the
  candidate has no documents ("No résumé attached — upload via Parse Résumé").

### 7.5 Tabs — a11y (ARIA tablist)

- `detail-tabs.tsx` renders `role="tablist"`; each tab `role="tab"` with `aria-selected`,
  `aria-controls={panelId}`, `id={tabId}`, `tabIndex={selected ? 0 : -1}`.
- Panels `role="tabpanel"` with `aria-labelledby={tabId}`, `tabIndex={0}`.
- **Keyboard:** ArrowLeft/Right move focus between tabs (roving tabindex), Home/End jump to first/last,
  Enter/Space activate. The Notes tab label shows the visible count (`Notes (N)`), ported from legacy.

### 7.6 Notes tab

- **Composer:** a `noteType` toggle (two chips: Internal / External) + a `<textarea>` (labelled via
  `Field`) + an "Add note" `Button`. Submit → `POST /:id/notes` → prepend the returned `NoteDTO` to local
  list; toast; clear the textarea.
- **List:** newest-first; each note is a `Card`-like row showing `authorName ?? "—"`, relative
  `createdAt`, a `noteType` `Badge`, and the **body rendered as `<p className="whitespace-pre-wrap">{body}</p>`
  — escaped React text, no `dangerouslySetInnerHTML` (D-3).**
- `EmptyState` when there are no notes. @mention autocomplete, the 5-way type badge, and the outreach
  panel are **deferred** (§9).

---

## 8. Board card → detail link (D-9)

`candidate-card.tsx` (Wave 2.1) is a dnd-kit draggable whose body carries the drag listeners; the move
`<select>` already sits **outside** those listeners in the footer. Add the detail link the same way:

- In the footer bar (next to / above the move `<select>`), render
  `<Link href={\`/candidates/${card.id}\`} className="…">View profile</Link>` — outside `{...listeners}`,
  so a click navigates and never starts a drag.
- Add a `PointerSensor` **activation constraint** (`{ distance: 5 }`) to the board's `DndContext` so even
  a future *name-as-Link* wouldn't fight the drag (a <5px press is a click, not a drag). Low-risk, improves
  the existing drag ergonomics.
- The link is keyboard-focusable (real `<a>`), covering pointer + keyboard navigation to the profile.

No change to the card's drag behavior or the move `<select>`.

---

## 9. Deferred (call out — NOT designed here)

Per the scope, these are explicitly out of this slice (IMPLEMENTATION-PLAN §2.2–2.3 continues):

- **@mention autocomplete + notify** + the `mentions`/notify model (cursor-aware picker, keyboard nav,
  first-name resolution). Notes render mentions as **plain escaped text** for now.
- **Notes ETL backfill** from the Sheet (`legacyId` idempotent upsert, keep-newest+flag on conflict) —
  the `legacyId` column + `upsertByLegacyId` are provisioned; the ETL job is deferred.
- **Outreach-history panel** (legacy `OutreachAttempts` JSON) + `candidate_log_outreach`.
- **Auto-handoff to Operate on "Started"** (`op_add_provider`) — *with the idempotency-key fix* for the
  legacy `"P"+Date.now()` dup bug. Lives with the `move` path, not this detail slice.
- **Résumé byte/storage preview** (Drive iframe → Supabase bucket) — Wave 6. This slice lists metadata +
  `legacyUrl` only.
- **Standalone track-editor pill** — track is **edit-only in the Details form** for now.
- **The 5-way note-type badge** (call/email/text/client/internal) — collapsed to `internal`/`external`.
- **Details quick-actions** (Open in Templates/Screening) + the score/disqualify chips (need
  `client_rules`) + Journey link.
- **Actor-name resolution** for stage history / notes (`actorId` → display name join).

---

## 10. Tests (mock repositories/service — no DB)

Vitest, mirroring `move.route.test.ts` / `save.route.test.ts` (hoisted mocks: `server-only`,
`next/headers`, `auth`, the services). **CONVENTIONS §authorization-failure: every guarded route has a
401 test.**

**Read service (`candidateService.getCandidateDetail`):**
- PII gating: a `viewCredentials` viewer gets `candidate.licenseNumber` + document `extractedText`;
  a non-cap viewer gets **neither** (both omitted). `canVerifyCredentials` reflects the role.
- Composes documents + notes + stageHistory; `clientName` resolved from the clients map; 404 when the
  candidate is missing/soft-deleted.
- Notes are already scoped by `visibleNotes` (v1: pass-through) and mapped to `NoteDTO`.

**Edit (`candidateService.update` + route):**
- Maps to `repository.update` and **cannot touch status/pipeline**: `.strict()` schema rejects a body
  with `status`/`licenseStatus` (422); the service never writes those keys.
- Writes an audit row (`action:"update"`, before/after = changed keys) inside the txn.
- Route: 401 unauth; 200 happy (re-gated DTO out); **403 when `licenseNumber` present without
  `viewCredentials`**; 404; 422 bad enum/unknown key.

**Verify-license (`candidateService.verifyLicense` + route):**
- Sets `licenseStatus` + `licenseVerifiedAt` + `licenseVerifiedById` (+ optional expiry/number) and
  writes an `action:"verify_license"` audit row in one txn.
- Route: 401; 200 happy (open to a no-capability operator — proves Screener can verify); **403 when
  `licenseNumber` present without `viewCredentials`**; 404; 422.
- Regression: after `verifyLicense` sets `Active`, a subsequently-attempted `SUBMITTED_TO_CLIENT` move
  passes `checkStageGate` (proves verification unblocks the gate).

**Notes:**
- `noteService.add`: **stored raw** — a body of `"<img src=x onerror=alert(1)>"` is persisted verbatim
  (assert the value passed to `noteRepository.create.body` is unchanged, no HTML stripping); `authorId`/
  `authorName` come from `user` (not the client body); writes an `action:"add_note"` audit; 404 when the
  candidate is missing.
- `visibleNotes` (pure): v1 returns both `internal` + `external` for an operator viewer; the future
  external-only branch is a documented seam (add the test when the client-portal viewer lands).
- Route `POST notes`: 401; 201 add; 422 empty/oversized body or bad `noteType`. Route `GET notes`: 401;
  200 list (server-scoped, never client-filtered).

**Client (pure helpers / component-light):**
- A note-render assertion (RTL): a body containing `<script>`/`<img onerror>` renders as **visible text**,
  the DOM contains **no `<script>`/no executing element** — proves the escaped-text rendering (no
  `dangerouslySetInnerHTML`).
- Tabs: ArrowRight/Home/End move the active tab (roving tabindex); the selected panel has
  `aria-labelledby` its tab.

---

## 11. Open questions / assumptions (flag — do not guess)

- **OQ-1 (route/nav):** assumed base path **`/candidates/[id]`** under the `(app)` segment (no shared
  layout → the page does its own `getCurrentUser()`→`redirect` guard, mirroring `pipeline`/`dashboard`).
  Confirm the route name (vs `/pipeline/[id]` or a modal-over-board). Legacy was a modal; this slice makes
  it a **full page** (deep-linkable, back-button friendly) — confirm that's the intended UX over a modal.
- **OQ-2 (verify-license authZ):** recommended **open to operators (`requireUser`)** because license
  status gates the pipeline and Screeners/Associates hold no capabilities — gating verify behind
  `viewCredentials` would wedge the pipeline. Writing `licenseNumber` still needs `viewCredentials`.
  Confirm this matches the intended control (vs. leadership-only verification).
- **OQ-3 (`update` signature):** adding `user` + an audit txn to `candidateService.update` changes its
  signature. The `create` path already has `user`; confirm no other caller of `update` breaks (grep shows
  only the route + tests; `move` writes via the repo directly, not via `service.update`).
- **OQ-4 (stage-mover client pre-check):** the full detail DTO carries `email`/`phone`/`population`/
  `setting`, so a faithful client `checkStageGate` mirror is possible (unlike the board card). Recommend
  adding it (disable invalid options) since the data's already present — confirm, or keep server-only +
  toast-on-block for parity with the board.
- **OQ-5 (actor names):** stage-history + notes carry `actorId`/`authorId` (opaque ids); resolving them to
  display names needs a users lookup. Deferred — `authorName` is denormalized on notes; stage-history
  shows the id (or is omitted from the header) until a resolver lands. Confirm acceptable for the demo.
- **Assumption:** `documentRepository.listByCandidate` already excludes soft-deleted docs (verified);
  résumé "status" is derived from `storageKey`/`legacyUrl` presence (no dedicated status column exists).
- **Assumption:** the deferred notes ETL will map legacy `NoteType` `call`/`email`/`text`/`internal` →
  `internal` and `client` → `external` (documented in §2); the two-value model is intentional for v1.
- **Assumption:** `clients` is small (≤ a handful of rows) → fetch-all + in-memory `id→name` map (reused
  from the board), no per-row join.
