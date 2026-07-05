# Activity Log View (`vw="activity"`, Wave 2.5) — Design

**Status:** design (architect). Backend/frontend implement repo → service → API → client → tests from
this spec. **Design only — no implementation, no migration, no commit.** Branch `feat-activity-log`.
Conforms to `DECISIONS.md` (wins on conflict), `STACK-ARCHITECTURE.md`, `CONVENTIONS.md`, and the
existing Wave 0.5 audit build + Wave 2.1 search/pagination.

**Problem:** every mutation already writes an append-only `activity_log` row via `writeAudit`
(`src/server/db/audit.ts`), and per-entity reads exist (`auditRepository.listForEntity` /
`auditService.listAuditForEntity`, `viewAudit`-gated). What's missing is a **whole-log, filterable,
paginated admin view** — a single audit surface over *all* entities, so an Owner/Admin can answer
"who did what, when" across the system, not just per candidate.

**Reuses (does NOT rebuild):**
- Keyset-cursor pagination from `docs/design/search-pagination.md` + `src/lib/validation/cursor.ts`
  (`(sortValue, id)` tuple, opaque base64url, `decodeCursor` → `null` on malformed).
- `userRepository.namesByIds` (batched actor id → name; already used by `listTrash`).
- `requireCapability("viewAudit")` guard; `apiHandler`/`json`/`AppError`; the RSC-SSR-page-1 +
  client-load-more shape (`candidates/page.tsx` + `candidates-list.tsx` + `list-fetch.ts`).
- Shared UI primitives: `Table`/`Td`, `Badge`, `Button`, `EmptyState`, `Field`, `Select`, the
  URL-synced filter pattern (`list-filters.tsx`) + `FilterChip`.

---

## Headline decisions

| # | Decision |
|---|----------|
| **AL-1** | **New `auditRepository.list(filters, cursor, take)`** sorted `at desc`, keyset `(at, id)`. Filters: `action`, `actor`, `entity`, and a `from`/`to` **date range** on `at`. Existing `listForEntity` stays untouched. |
| **AL-2** | **Index set (migration): add `@@index([at, id])`** (the unfiltered/date-range whole-log sort) **and `@@index([action, at, id])`** (action is the highest-selectivity, most-used filter). **Do NOT add** `@@index([entity, at, id])` or `@@index([actor, at, id])` — `entity` has ~3 values (low selectivity, a partial index scan on `[at,id]` is fine) and `actor`-scoped whole-log reads already ride the existing `@@index([actor, at])`. Keep the write-amplification minimal on an append-only, high-write table. |
| **AL-3** | **The LIST omits raw `before`/`after`.** Rows carry only `hasChanges: boolean`. The heavy PII-bearing snapshots load **on demand** via a separate `getActivityDetail(id, viewer)` (same `viewAudit` gate) when a row is expanded. Justification: payload size (snapshots are whole-entity JSON) + never dumping PII into a wide always-rendered table + lazy = less PII in the browser/history at rest. |
| **AL-4** | **Light entity labeling.** For `entity=candidate` only, batch-resolve `entityId` → candidate `name` (one `findByIds`-style query per page, incl. soft-deleted so moved/deleted still label). **Purged** candidates (row gone) fall back to a muted, **non-linked** short id. `document`/`import_batch` render the raw id (no link) — not worth resolving. Links only to `/candidates/[id]` for a *resolvable, non-purged* candidate. |
| **AL-5** | **Filter bar (all URL-synced, shareable):** `action` (select of known actions), `entity` (candidate/document/import_batch), `actor` (user picker — the distinct actors that appear), and a `from`/`to` **date range**. Table columns: **When · Who · Action (`Badge`) · Entity (label/link) · Changes (expander)**. **Load-more** pagination + honest "Showing N of {total}". Empty state. |
| **AL-6** | **Access = `viewAudit` (Owner/Admin).** `/activity` RSC guards with `getCurrentUser()` + `hasCapability(..,"viewAudit")` → a clear "no access" state for non-holders; the service **independently** enforces `requireCapability("viewAudit")` (server authoritative, never trusts UI hiding). Nav appends **Activity** only for `viewAudit` holders (mirrors the `bulkImport` → Import gating in `layout.tsx`). |
| **AL-7** | **`before`/`after` render as a safe, compact diff** — a changed-keys table (key · before → after), plain-text values, **no `dangerouslySetInnerHTML`**. Raw-JSON `<details>` fallback for the full blob. Values pretty-printed via `JSON.stringify`, never `eval`/HTML. |

---

## 1. Repository — `auditRepository.list` + index migration

### 1.1 Known vocab (new constants)

`action` and `entity` are currently free-form strings written by `writeAudit`. To validate the
filters (and populate the `action` select) add small **read-only unions** to `src/lib/constants`
(a new `audit.ts`, re-exported from the barrel). These mirror what the services actually write today
(grep-confirmed) — they are validation vocab, NOT a schema change:

```ts
// src/lib/constants/audit.ts
export const AUDIT_ACTIONS = [
  "create", "update", "move", "verify_license", "add_note",
  "attach", "delete", "restore", "purge", "import", "commit",
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export const AUDIT_ENTITIES = ["candidate", "document", "import_batch"] as const;
export type AuditEntity = (typeof AUDIT_ENTITIES)[number];

// Display labels + Badge tones (Action pill): e.g. delete/purge → danger, restore/create → success,
// move/update → navy, others → neutral. Pure map, isomorphic (client renders it).
export const AUDIT_ACTION_LABEL: Record<AuditAction, string> = { /* "verify_license" → "Verify license", … */ };
export const AUDIT_ACTION_TONE: Record<AuditAction, "neutral"|"navy"|"success"|"amber"|"danger"> = { /* … */ };
export function auditActionLabel(a: string): string { /* fallback to a humanized raw string for unknown legacy actions */ }
```

> **Legacy tolerance:** unknown action/entity strings (e.g. ETL-seeded) must still *display* — the
> select only offers the known set for *filtering*, but the table humanizes any raw string it gets.

### 1.2 The keyset cursor `(at, id)`

`cursor.ts` today models `createdAt`/`name` kinds. **Extend it minimally** to add an `"at"` kind
(same tuple mechanics; `at` is an ISO timestamp value, `id` cuid tiebreak) — or, cleaner, generalize
the existing `createdAt` kind to any timestamp field. Recommended: add `"at"` to `CursorKind` +
`AuditListOrderBy = "at_desc"` so the audit list is self-contained and doesn't overload the
candidate `ListOrderBy`. `encodeCursor(row, "at_desc")` → `base64url([row.at.toISOString(), row.id])`;
`decodeCursor(c, "at_desc")` validates the value parses to a Date (same throw-free `null` contract).

### 1.3 `list(filters, cursor, take)`

```ts
// src/server/repositories/audit.repository.ts (added alongside listForEntity)
export interface AuditListFilters {
  action?: AuditAction;
  entity?: AuditEntity;
  actor?: string;         // user id
  from?: Date;            // inclusive lower bound on `at`
  to?: Date;              // inclusive upper bound on `at`
}

async list(filters: AuditListFilters, cursor: PageCursor | null, take: number) {
  const where: Prisma.ActivityLogWhereInput = {
    ...(filters.action ? { action: filters.action } : {}),
    ...(filters.entity ? { entity: filters.entity } : {}),
    ...(filters.actor ? { actor: filters.actor } : {}),
    ...(filters.from || filters.to
      ? { at: { ...(filters.from ? { gte: filters.from } : {}), ...(filters.to ? { lte: filters.to } : {}) } }
      : {}),
    // keyset predicate for `at desc` (id desc tiebreak):
    ...(cursor
      ? { OR: [
          { at: { lt: new Date(cursor.value) } },
          { at: new Date(cursor.value), id: { lt: cursor.id } },
        ] }
      : {}),
  };
  return prisma.activityLog.findMany({
    where,
    orderBy: [{ at: "desc" }, { id: "desc" }],
    take: take + 1,               // +1 → hasMore probe (drop the extra, cursor = row `take`)
    // NOTE: select omits before/after for the list (AL-3) — only the detail read pulls them.
    select: { id: true, at: true, actor: true, action: true, entity: true, entityId: true,
              // hasChanges without shipping the blob: a cheap presence check.
              before: true, after: true }, // see §2.3 — mapped to `hasChanges`, not returned raw
  });
}

// Detail read — the ONE row with its snapshots (AL-3):
findById(id: string) {
  return prisma.activityLog.findUnique({ where: { id } }); // includes before/after
}

// True total for "Showing N of M" — same `where` sans the keyset predicate:
count(filters: AuditListFilters) { return prisma.activityLog.count({ where: /* filters only */ }); }

// Distinct actors that appear (for the actor picker) — a lightweight groupBy:
distinctActorIds() { return prisma.activityLog.groupBy({ by: ["actor"] }).then(r => r.map(x => x.actor)); }
```

> **`hasChanges` without shipping PII:** two options — (a) `select` `before`/`after` in the list
> query and map to `Boolean(before) || Boolean(after)` **in the repo/service, discarding the blob
> before it leaves the service** (simplest, snapshots never reach the DTO); or (b) skip them in the
> list `select` entirely and let `hasChanges` be inferred (`action !== "purge"/"restore"`… fragile).
> **Recommend (a):** correct and the blob is dropped at the DTO boundary — it never crosses the wire
> for the list. (If snapshot payloads are large enough to matter for the DB→app hop, revisit with a
> generated `hasChanges` column; out of scope here.)

### 1.4 Migration — indexes

```prisma
model ActivityLog {
  // …unchanged columns…
  @@index([entity, entityId])   // existing — per-entity trail
  @@index([actor, at])          // existing — actor-scoped
  @@index([at, id])             // NEW (AL-2) — whole-log `at desc` sort + date-range scans
  @@index([action, at, id])     // NEW (AL-2) — action-filtered sort (highest-selectivity filter)
  @@map("activity_log")
}
```

One additive migration, **two new indexes, no column/data change** (append-only table; safe,
non-destructive — but flag to the owner per ground rule 6 since it touches a live table). `entity`-
and `actor`-only-filtered sorts intentionally ride `[at,id]` / the existing `[actor,at]` (AL-2
justification).

---

## 2. Service — `auditService.listActivity` (+ `getActivityDetail`) + DTOs

### 2.1 DTOs (wire shapes → `src/lib/validation/audit.ts`)

```ts
// LIST row — NO raw before/after (AL-3). `at` is an ISO string (serialized).
export interface ActivityItemDTO {
  id: string;
  at: string;               // ISO
  actorId: string;
  actorName: string;        // resolved; "Unknown" when the user row is gone
  action: string;           // raw code; client humanizes via auditActionLabel
  entity: string;           // "candidate" | "document" | "import_batch" | legacy
  entityId: string;
  entityLabel: string | null;   // candidate name when resolvable (AL-4), else null
  entityHref: string | null;    // "/candidates/[id]" only for a live candidate, else null
  hasChanges: boolean;
}
export interface ActivityListDTO {
  items: ActivityItemDTO[];
  nextCursor: string | null;
  hasMore: boolean;
  total: number;
}
// DETAIL — the snapshots, on demand (AL-3). PII permitted (viewer holds viewAudit).
export interface ActivityDetailDTO {
  id: string;
  before: unknown | null;   // whole-entity JSON snapshot
  after: unknown | null;
}
// Filter-bar options (actor picker) — resolved actor ids → names:
export interface ActivityActorOption { id: string; name: string; }
```

### 2.2 `listActivity`

```ts
async listActivity(filters: AuditListFilters, cursor: PageCursor | null, viewer: AuthUser): Promise<ActivityListDTO> {
  await requireCapability("viewAudit");                      // AL-6 — server authoritative
  const rows = await auditRepository.list(filters, cursor, ACTIVITY_PAGE);   // take+1 inside
  const hasMore = rows.length > ACTIVITY_PAGE;
  const page = hasMore ? rows.slice(0, ACTIVITY_PAGE) : rows;

  // Batch-resolve actor names (one query) — reuse userRepository.namesByIds (like listTrash).
  const actorNames = await userRepository.namesByIds(page.map(r => r.actor));
  // Batch-resolve candidate labels (one query, incl. soft-deleted) for entity=candidate rows (AL-4).
  const candidateIds = page.filter(r => r.entity === "candidate").map(r => r.entityId);
  const candidateNames = await candidateRepository.namesByIds(candidateIds); // NEW tiny repo helper (incl. deleted)

  const items = page.map(r => toActivityItem(r, actorNames, candidateNames));  // drops before/after → hasChanges
  const nextCursor = hasMore ? encodeCursor({ at: page.at(-1)!.at, id: page.at(-1)!.id }, "at_desc") : null;
  const total = await auditRepository.count(filters);
  return { items, nextCursor, hasMore, total };
}
```

- **`ACTIVITY_PAGE = 50`** (matches `LIST_PAGE`).
- **`toActivityItem`** (pure mapper, `src/server/services/audit.mappers.ts` or inline) maps the row →
  DTO: resolves `actorName` (`?? "Unknown"`), computes `hasChanges = Boolean(before) || Boolean(after)`
  and **discards the blobs**, and for `entity==="candidate"` sets `entityLabel` from `candidateNames`
  and `entityHref = candidateNames.has(id) && !isDeleted ? "/candidates/${id}" : null`. (If we only
  need name for label, resolving *live* candidates suffices for the link; include-deleted lets a
  moved/deleted candidate still show its name, un-linked. **Purged** → not in map → `null`/short-id.)

### 2.3 `getActivityDetail` (lazy snapshots)

```ts
async getActivityDetail(id: string, viewer: AuthUser): Promise<ActivityDetailDTO> {
  await requireCapability("viewAudit");                      // same gate — PII permitted to holders
  const row = await auditRepository.findById(id);
  if (!row) throw new AppError("NOT_FOUND", "Activity entry not found");
  return { id: row.id, before: row.before ?? null, after: row.after ?? null };
}
```

### 2.4 `listActorOptions` (actor picker)

```ts
async listActorOptions(viewer: AuthUser): Promise<ActivityActorOption[]> {
  await requireCapability("viewAudit");
  const ids = await auditRepository.distinctActorIds();
  const names = await userRepository.namesByIds(ids);
  return ids.map(id => ({ id, name: names.get(id) ?? "Unknown" }))
            .sort((a, b) => a.name.localeCompare(b.name));
}
```

> Small `candidateRepository.namesByIds(ids, { includeDeleted: true })` helper is new but trivial
> (mirrors `userRepository.namesByIds`); it must bypass the default soft-delete filter so a
> since-deleted candidate still labels.

---

## 3. API routes + `/activity` page/UI + nav

### 3.1 Routes

The RSC renders **page 1 directly** via the service (no self-fetch, no flash — mirrors
`candidates/page.tsx`). Client load-more hits an API route.

**`GET /api/activity`** — the load-more (keyset) endpoint. `apiHandler` + `requireCapability` inside
the service. Query: `action`, `entity`, `actor`, `from`, `to`, `cursor`. Validate with a new
`activityQuerySchema` (zod) in `src/lib/validation/activity.ts`:

```ts
export const activityQuerySchema = z.object({
  action: z.enum(AUDIT_ACTIONS).optional(),
  entity: z.enum(AUDIT_ENTITIES).optional(),
  actor: z.string().min(1).optional(),
  from: z.coerce.date().optional(),           // "YYYY-MM-DD" → Date (start of day)
  to: z.coerce.date().optional(),             // treated as inclusive end-of-day in the route/service
  cursor: z.string().min(1).optional(),
});
```

Route body (mirrors `candidates/list/route.ts`): parse → `decodeCursor(cursor, "at_desc")` (malformed
→ `AppError("BAD_REQUEST")`) → `auditService.listActivity(filters, decoded, user)` → `json(list)`.
(No `requireUser` needed at the route beyond the service gate, but keep a `requireUser()` for a clean
401 vs 403 like the list route does; the service is the authoritative `viewAudit` check.)

**`GET /api/activity/[id]`** — the lazy detail (snapshots) endpoint → `getActivityDetail(id, user)`
→ `json({ before, after })`. Fetched only when a row is expanded.

> **Date-range semantics:** `to` from a date input is midnight; the route/service should widen `to`
> to end-of-day (`+1 day` exclusive, or set time to 23:59:59.999) so "to = today" includes today's
> rows. Document in the route.

### 3.2 Page — `src/app/(app)/activity/page.tsx` (RSC)

```
- getCurrentUser() → redirect("/sign-in") if none.
- if (!hasCapability(user.role, "viewAudit")) → render a clear "No access" state
  (EmptyState: "You don't have permission to view the activity log."), NOT a redirect
  (a 403-style in-app message; the service also enforces — defence in depth, AL-6).
- else: read searchParams (action/entity/actor/from/to), Promise.all([
     auditService.listActivity(filters, null, user),   // page 1
     auditService.listActorOptions(user),              // actor picker options
  ]).
- Header ("Activity" + "{total} events"), <ActivityFilters actors={...}/>, and
  <ActivityList key={filterSignature} initial={page1} /> (remount-on-filter-change, like CandidatesList).
```

### 3.3 Filters — `activity-filters.tsx` (client, URL-synced)

Mirrors `list-filters.tsx`: reads `useSearchParams`, `router.replace` on change (`scroll:false`),
all params in the URL (shareable). Controls:
- **Action** — `<Select>` of `AUDIT_ACTIONS` (labels via `AUDIT_ACTION_LABEL`) + "All".
- **Entity** — `<Select>` of `AUDIT_ENTITIES` + "All".
- **Actor** — `<Select>` of `ActivityActorOption[]` (passed from RSC) + "All". (A picker, not free text
  — bounded set, no PII exposure beyond names the viewer already may see.)
- **Date range** — two `<input type="date">` (from / to) via `Field`.
- **Clear** button resets all params.

### 3.4 List + expander — `activity-list.tsx` (client)

Mirrors `candidates-list.tsx` (SSR page 1 in `initial`, accumulate via Load more; `list-fetch.ts`
equivalent carrying the URL filters + cursor). Renders a `Table`:

| When | Who | Action | Entity | Changes |
|---|---|---|---|---|
| `at` (relative + title=absolute) | `actorName` | `<Badge tone={AUDIT_ACTION_TONE[action]}>{label}</Badge>` | `entityLabel` → `<Link href={entityHref}>` when set, else muted `entity #shortId` | expander button (disabled when `!hasChanges`) |

- **Expander:** a `<button aria-expanded>` per row toggling a detail sub-row. On first expand, **lazy-
  fetch** `GET /api/activity/[id]`, then render `<AuditDiff before={..} after={..}/>`. Show a spinner
  while loading; cache the fetched detail in row state so re-expand is instant.
- **`AuditDiff`** (AL-7, safe render): compute changed keys from `before`/`after` (both may be
  objects; a `create` has only `after`, a `delete` only `before`). Render a small table `Field ·
  Before → After`, values as plain text (`String`/`JSON.stringify` for nested), **no HTML injection**.
  Provide a `<details>Raw JSON</details>` fallback (pretty-printed) for the full snapshot. A pure
  `diffKeys(before, after)` helper lives in a testable `lib/audit-diff.ts` (no React).
- **Load more:** `Button` "Load more" + honest "Showing {rows.length} of {initial.total}" + a11y
  live-region announcement (copy the pattern from `candidates-list.tsx`). `EmptyState` when
  `total === 0` ("No activity matches these filters").

### 3.5 Nav gating

In `src/app/(app)/layout.tsx`, alongside the `bulkImport` → Import append:

```ts
if (hasCapability(user.role, "viewAudit")) items.push({ href: "/activity", label: "Activity" });
```

`BASE_NAV_ITEMS` stays clean (ungated render can never surface Activity), matching the Import
precedent. `activeNavHref` needs no change (longest-match already handles `/activity`).

---

## 4. Tests

**Repo (`audit.repository.test.ts`, DB/integration or with a prisma mock like existing repo tests):**
- `list` builds the right `where` for each filter (action / entity / actor / from / to) and combines
  them (AND).
- keyset predicate: `at desc, id desc`; `take = ACTIVITY_PAGE + 1`; date-range `gte`/`lte`.
- `list` `select` does **not** return raw `before`/`after` on the DTO path (blob dropped).
- `count` uses filters without the keyset predicate.
- `distinctActorIds` de-dupes.

**Service (`audit.service.test.ts`, extend the existing file — mock repo + userRepo + candidateRepo):**
- **AuthZ:** non-`viewAudit` viewer → `listActivity` / `getActivityDetail` / `listActorOptions` throw
  `FORBIDDEN` (the load-bearing gate — parametrize over Director/Manager/Screener/Associate; Owner/Admin
  pass). Reuse the `requireCapability` mocking already in the suite.
- **Actor names resolved:** `userRepository.namesByIds` called once with the page's actor ids; DTO
  `actorName` filled; missing id → `"Unknown"`.
- **Entity labeling (AL-4):** `entity=candidate` → `entityLabel` from candidate map, `entityHref`
  `/candidates/[id]` when present; **purged** (id absent from map) → `entityLabel=null`/short-id,
  `entityHref=null` (no link). `document`/`import_batch` → no label, no link.
- **`hasChanges` + no PII leak:** DTO carries `hasChanges` true/false and **never** the raw
  `before`/`after` (assert the keys are absent on `ActivityItemDTO`). `getActivityDetail` **does**
  return them (holder-only).
- **Pagination:** `nextCursor` encodes `(at,id)` of the last returned row; `hasMore` true when repo
  returns `PAGE+1`; page trimmed to `PAGE`; `total` from `count`.

**Cursor (`cursor.test.ts`):** add `"at_desc"` round-trip + malformed → `null` (bad base64 / bad
JSON / non-date value).

**Route (`activity.route.test.ts`, mirror `list.route.test.ts`):**
- `GET /api/activity`: valid filters parse; malformed `cursor` → 400; forwards decoded cursor +
  filters to the service; non-holder → **403** (service throws → `apiHandler` maps `FORBIDDEN`).
- `GET /api/activity/[id]`: non-holder → 403; unknown id → 404; holder → `{before, after}`.
- Bad `from`/`to` (unparseable date) → 422 (zod).

**Diff helper (`audit-diff.test.ts`):** `diffKeys` — create (only `after`), delete (only `before`),
update (changed subset), no-change; nested-value stringify; no crash on `null`/non-object.

---

## 5. Open questions / assumptions

1. **[Blocking-ish] `hasChanges` cost.** The list `select`s `before`/`after` only to derive a
   boolean, then drops them at the DTO boundary (AL-3 / §1.3 option a) — the blobs travel DB→app but
   **never** app→client. If snapshot JSON is large and this hop is measurable on a wide list, we'd
   want a DB-side presence signal (a generated/`hasChanges` column, added by a later migration). **Do
   the snapshots warrant that now, or is the DB→app read acceptable at 50 rows/page?** (Assumption:
   acceptable; note for perf review.)
2. **Date-range inclusivity + timezone.** `to` is widened to end-of-day (§3.1). **In whose timezone —
   server/UTC or the viewer's?** Assumed **UTC** (all `at` are UTC; date inputs interpreted as UTC
   day bounds). Confirm; a viewer-tz interpretation needs the client to send offsets.
3. **Actor picker scale.** `distinctActorIds` groupBy is cheap now (few users) but is an unindexed
   distinct scan on a growing table. Fine at current scale; if the log grows large, cache the actor
   list or source it from the `user` table instead. Assumed fine for Wave 2.5.
4. **Legacy/ETL actions & actors.** ETL may seed `activity_log` rows with actions/entities outside
   the known unions and `actor` ids that don't resolve to a `User` (schema comment already warns of
   this). Handled: table humanizes any raw action; unresolved actor → "Unknown"; filters only offer
   the known set. **Confirm the ETL writes `at` and `actor` for historical rows** (else date sort /
   actor filter are lopsided for pre-cutover history).
5. **`entity=candidate` label includes soft-deleted.** Assumption: labeling a *deleted* (not purged)
   candidate by name to a `viewAudit` holder is acceptable (they can already see Trash). Link is
   suppressed for deleted/purged; only live candidates link. Confirm this is the desired behavior vs.
   never labeling deleted candidates.
6. **Detail authЗ granularity.** `getActivityDetail` gates on `viewAudit` only (not per-entity) —
   consistent with "the whole audit surface is admin-only." No finer gate proposed. Confirm we don't
   need, e.g., to still honor `viewCredentials` for `licenseNumber` *inside* a snapshot (currently a
   `viewAudit` holder is Owner/Admin, who also hold `viewCredentials`, so moot — but worth a line if
   the role matrix ever changes).
