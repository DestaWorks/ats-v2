# Wave 2.5 — Trash / Restore / Purge (Candidate Lifecycle) Design

**Status:** design (architect). Backend/frontend implement repo + service + routes + `/trash` page +
detail-page delete entry point + tests from this spec. **Design only — no implementation, no
migration, no commit.** Conforms to `DECISIONS.md` (wins on conflict), `DATA-MODEL.md`,
`STACK-ARCHITECTURE.md`, `CONVENTIONS.md`, and the Wave 2.1 board / Wave 2.3 detail designs
(`docs/design/wave-2.1-pipeline.md`, `docs/design/wave-2.3-candidate-detail.md`).

**Feature:** complete the candidate lifecycle — **Delete** (soft-delete → Trash) from the candidate
detail page, a **`/trash`** view of soft-deleted candidates with **Restore**, and **Purge**
(permanent, cascading hard-delete, capability-gated). Today there is no delete UI, no trash view, and
no purge.

**Reuses (does NOT rebuild):** `candidateRepository.softDelete(id, actorId)` + `restore(id)`;
`candidateService.softDelete(id)` (gates `requireUser`); `CandidateListFilters.includeDeleted` +
`buildCandidateWhere` (soft-deleted excluded by default via `deletedAt: null`); the `purgeCandidate`
**capability** (`roles.ts`) + `hasCapability`/`requireCapability`; the `Candidate → Document /
CandidateNote / StageHistory` `onDelete: Cascade` relations (schema §229/§271/§293); `writeAudit`
(txn-scoped) + `withTransaction`; `apiHandler`/`json`/`AppError`/`requireUser`; `toCandidateDTO` (PII
gate); the shared `Modal` (native `<dialog>`), `Table`/`Button`/`Badge`/`EmptyState`; the app-shell
nav model (`lib/nav.ts` + capability-gated layout); the `/candidates` list + detail-page shells.

---

## Headline decisions

| # | Decision |
|---|----------|
| **D-1** | **Route contract (REST-ish):** `DELETE /api/candidates/[id]` = soft-delete (added to the existing `[id]/route.ts` next to `PATCH`); `POST /api/candidates/[id]/restore`; `POST /api/candidates/[id]/purge`. No request bodies (id from params → no zod schema). The `/trash` list is loaded by the RSC page via a **direct** `candidateService.listTrash(user)` call — no `GET` route (mirrors the board / detail pages). §3. |
| **D-2** | **Who can do what.** **Soft-delete** and **Restore** are open to any operator (`requireUser`) — both are reversible and match `softDelete`'s current gate. **Purge** requires `requireCapability("purgeCandidate")`, which today resolves to **Owner + Admin only** (NOT Director/Manager — `purgeCandidate` is an `ADMIN_CAPABILITY`, `roles.ts` §45–53). The UI hides Purge for non-holders; the **server is authoritative**. §2. |
| **D-3** | **All three actions are audited** (`writeAudit`, actions `delete` / `restore` / `purge`), each in the same `withTransaction` as its mutation. **`softDelete` audits today? NO — it writes none.** This wave **adds an audit write to `softDelete`** (contained change, mirrors `update`'s D-8). §2.1. |
| **D-4** | **Purge is trash-only (two-step safety gate).** `purge` acts **only on an already-soft-deleted candidate** — it throws `NOT_FOUND`/`CONFLICT` on a live one. So there is **no one-click permanent delete** anywhere: you Delete (→ Trash) first, then Purge from `/trash`. The purge action therefore lives **only in the Trash rows**, never on the detail page. §2.3. |
| **D-5** | **Purge cascades cleanly** via Prisma `candidate.delete()` — `Document`, `CandidateNote`, `StageHistory` all `onDelete: Cascade` to `Candidate` (schema, verified §4). The **audit row survives** because `activity_log` stores `entityId`/`actor` as **plain strings with no FK** (schema §106) — the cascade cannot touch it. §4. |
| **D-6** | **`/trash` RSC page** renders a `Table` of soft-deleted candidates (name, credential, client, status-at-deletion, deleted-when, deleted-by), each row with **Restore** + (capability-gated) **Purge** actions and an `EmptyState`. New nav item **Trash** appended in the layout. Rows are **PII-gated** (`toCandidateDTO` boundary → no `licenseNumber`; trash never surfaces sensitive PII). §5. |
| **D-7** | **Delete entry point = detail page.** A **Delete** button (destructive tone) on the detail header opens a **`Modal` confirm** ("Move to Trash?"); on confirm → `DELETE`, then `router.push("/pipeline")` + a toast/announce. Reversible → a simple confirm (no type-to-confirm). §6. |
| **D-8** | **Purge UX = type-to-confirm `Modal`.** Irreversible, so the confirm modal spells out the cascade ("permanently deletes the candidate **and their documents, notes, and stage history**"), and requires typing the candidate's **name** to enable the red **Purge permanently** button. §7. |
| **D-9** | **List/board coherence is automatic.** `buildCandidateWhere` and `groupByStatus`/`groupByStatusFiltered` already inject `deletedAt: null`, so a soft-deleted candidate disappears from the board, the flat list, dashboard funnel, and per-column counts with no extra work. Restore clears `deletedAt` and **returns the candidate to its existing stage** (delete/restore never touch `status`/`stageOrder`/`stageEnteredAt`). §8. |

---

## 1. Repository additions (`candidate.repository.ts`)

`softDelete(id, actorId, tx?)` and `restore(id, tx?)` **already exist** — reused as-is. Add two:

```ts
/**
 * PERMANENT hard delete — cascades to documents, notes, stage history (onDelete: Cascade).
 * Irreversible. Only the purge service path (capability-gated) reaches this. No crypto (row is gone).
 */
async purge(id: string, tx?: Prisma.TransactionClient) {
  return db(tx).candidate.delete({ where: { id } });
},

/**
 * The Trash read: ONLY soft-deleted rows (`deletedAt != null`), newest-deleted first. A dedicated
 * method rather than a `list` filter — Trash sorts by `deletedAt desc` (not the keyset createdAt/name
 * machinery) and the set is small, so no cursor pagination in v1. `take` caps a runaway trash.
 */
async listDeleted(take?: number, tx?: Prisma.TransactionClient) {
  const rows = await db(tx).candidate.findMany({
    where: { deletedAt: { not: null } },
    orderBy: { deletedAt: "desc" },
    ...(take !== undefined ? { take } : {}),
  });
  return rows.map(decryptRow);
},
```

Notes:
- **`listDeleted` vs. an `onlyDeleted` filter:** rejected shoehorning into `list`/`buildCandidateWhere`
  because Trash needs a `deletedAt desc` order that the existing keyset `orderBy` union doesn't carry,
  and Trash doesn't need the search/track/status/keyset apparatus. A dedicated method is smaller and
  clearer. If Trash later needs cursor pagination, add a `deletedAt_desc` `ListOrderBy` then.
- `findById` **already** excludes soft-deleted unless `{ includeDeleted: true }` is passed — the
  service uses `includeDeleted: true` to load a candidate for restore/purge (see §2). No change.

---

## 2. Service additions (`candidate.service.ts`)

All three are **audited** and (for restore/purge) do their **existence/state guard** before mutating.
`softDelete` keeps its `requireUser()` self-gate; `restore`/`purge` take the resolved `AuthUser` from
the route (consistent with `move`/`update`/`verifyLicense`).

### 2.1 `softDelete` — add the missing audit + txn

```ts
/** Soft-delete → Trash. Open to any operator (reversible). NOW audited (action "delete"). */
async softDelete(id: string) {
  const user = await requireUser();
  const existing = await candidateRepository.findById(id);         // excludes already-deleted
  if (!existing) throw new AppError("NOT_FOUND", "Candidate not found");
  return withTransaction(async (tx) => {
    const deleted = await candidateRepository.softDelete(id, user.id, tx);
    await writeAudit(tx, {
      entity: "candidate", entityId: id, actor: user.id, action: "delete",
      before: { deletedAt: null },
      after: { deletedAt: deleted.deletedAt, deletedById: user.id, status: existing.status },
    });
    return deleted;
  });
},
```
`findById` (not `includeDeleted`) is the guard: a missing OR already-deleted candidate → `NOT_FOUND`
(idempotent — you can't re-trash a trashed candidate).

### 2.2 `restore(id, user)` — operators, audited

```ts
async restore(id: string, user: AuthUser) {
  const existing = await candidateRepository.findById(id, { includeDeleted: true });
  if (!existing) throw new AppError("NOT_FOUND", "Candidate not found");
  if (existing.deletedAt === null) throw new AppError("CONFLICT", "Candidate is not in Trash");
  return withTransaction(async (tx) => {
    const restored = await candidateRepository.restore(id, tx);
    await writeAudit(tx, {
      entity: "candidate", entityId: id, actor: user.id, action: "restore",
      before: { deletedAt: existing.deletedAt, deletedById: existing.deletedById },
      after: { deletedAt: null, status: restored.status },
    });
    return restored;
  });
},
```
Restore only clears `deletedAt`/`deletedById` (repo `restore`) — `status`/`stageOrder`/`stageEnteredAt`
are untouched, so the candidate returns to **exactly the stage it left** (D-9).

### 2.3 `purge(id, user)` — capability-gated, trash-only, cascading, audited

```ts
async purge(id: string, user: AuthUser) {
  // Server-authoritative gate — never trust the client. Owner/Admin only (roles.ts).
  // (Route also calls requireCapability; keeping the check here makes the service safe by itself.)
  if (!hasCapability(user.role, "purgeCandidate")) {
    throw new AppError("FORBIDDEN", "You don't have permission to purge candidates");
  }
  const existing = await candidateRepository.findById(id, { includeDeleted: true });
  if (!existing) throw new AppError("NOT_FOUND", "Candidate not found");
  if (existing.deletedAt === null) {
    throw new AppError("CONFLICT", "Only trashed candidates can be purged"); // D-4 two-step gate
  }
  return withTransaction(async (tx) => {
    // Audit BEFORE the delete (same txn). entityId/actor are plain strings on activity_log
    // (no FK) so the row survives the cascade. `before` captures identifiers for the trail.
    await writeAudit(tx, {
      entity: "candidate", entityId: id, actor: user.id, action: "purge",
      before: { name: existing.name, status: existing.status, deletedAt: existing.deletedAt },
    });
    await candidateRepository.purge(id, tx); // cascades documents/notes/history
    return { id };
  });
},
```

### 2.4 `listTrash(viewer)` — the `/trash` payload

```ts
async listTrash(viewer: AuthUser): Promise<CandidateTrashDTO> {
  const rows = await candidateRepository.listDeleted(TRASH_PAGE); // small cap, e.g. 200
  const clients = await clientRepository.list();
  const clientNames = new Map(clients.map((c) => [c.id, c.name]));
  const actorNames = await resolveUserNames(rows.map((r) => r.deletedById)); // §5.1
  const items = rows.map((row) => toTrashItem(toCandidateDTO(row, viewer), clientNames, actorNames));
  return { items };
}
```
`toCandidateDTO(row, viewer)` applies the **PII boundary** (no `licenseNumber` unless the viewer holds
`viewCredentials`) before the trash projection. `toTrashItem` builds the `CandidateTrashItemDTO`.

**Service AuthZ / audit summary**

| Action | Guard | Audited (action) | Existence / state guard |
|--------|-------|------------------|-------------------------|
| soft-delete | `requireUser` | ✅ `delete` (**added**) | `findById` must exist & not already deleted |
| restore | `requireUser` (route passes `user`) | ✅ `restore` | `findById(includeDeleted)` must exist **and** be deleted |
| purge | `requireCapability("purgeCandidate")` (Owner/Admin) | ✅ `purge` | must exist **and** be deleted (trash-only, D-4) |
| listTrash | `requireUser` (RSC `getCurrentUser`) | — (read) | — |

---

## 3. Routes

### 3.1 `DELETE /api/candidates/[id]` — soft-delete (add to existing `[id]/route.ts`)

```ts
export const DELETE = apiHandler<{ params: Promise<{ id: string }> }>(async (_req, ctx) => {
  await requireUser();                       // service also self-gates
  const { id } = await ctx.params;
  await candidateService.softDelete(id);
  return json({ ok: true, id });
});
```
Chose the **`DELETE` verb** (not `POST .../delete`) — soft-delete is the canonical "delete this
candidate" action and there's no body. 401 unauth, 404 missing/already-deleted.

### 3.2 `POST /api/candidates/[id]/restore/route.ts`

```ts
export const POST = apiHandler<{ params: Promise<{ id: string }> }>(async (_req, ctx) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  const restored = await candidateService.restore(id, user);
  return json({ candidate: toCandidateDTO(restored, user) });
});
```
401 unauth, 404 missing, 409 (`CONFLICT`) if not in Trash.

### 3.3 `POST /api/candidates/[id]/purge/route.ts`

```ts
export const POST = apiHandler<{ params: Promise<{ id: string }> }>(async (_req, ctx) => {
  const user = await requireCapability("purgeCandidate"); // 403 for non-holders, before any work
  const { id } = await ctx.params;
  await candidateService.purge(id, user);
  return json({ ok: true, id });
});
```
401 unauth, **403 without `purgeCandidate`**, 404 missing, 409 if not trashed. Returns only `{ ok, id }`
(the record is gone — never echo PII).

### 3.4 Trash list — **no route**

The `/trash` RSC page calls `candidateService.listTrash(user)` **directly** (no self-fetch), mirroring
the board/detail pages. A `GET /api/candidates/trash` is deferred until Trash needs client-side paging.

---

## 4. Cascade behavior on purge (verified against `prisma/schema.prisma`)

`candidate.delete()` (hard delete) cascades because every child relation declares
`onDelete: Cascade` to `Candidate`:

| Child model | Relation | Schema line |
|-------------|----------|-------------|
| `Document` | `candidate … onDelete: Cascade` | §236 |
| `CandidateNote` | `candidate … onDelete: Cascade` | §275 |
| `StageHistory` | `candidate … onDelete: Cascade` | §296 |

`Candidate.client` is `onDelete: SetNull` (the client is unaffected). **`activity_log` has NO relation
to `Candidate`** — `entityId`/`actor` are plain `String` columns (schema §106–118), so the purge
**audit row is not cascaded away**; the permanent-deletion event stays in the trail. No `Document`
blob/file cleanup is in scope here (documents store `legacyUrl`/extracted text, not managed blobs) —
flag **OQ-3** if external file storage lands before this ships.

---

## 5. Trash view (`/trash`) + nav

### 5.1 Page (`src/app/(app)/trash/page.tsx`, RSC)

- Guards with `getCurrentUser()` → `redirect("/sign-in")` (layout also guards — defence in depth).
- Loads `candidateService.listTrash(user)` and computes `canPurge = hasCapability(user.role,
  "purgeCandidate")` (passed to the client rows to gate the Purge button — **UI hint only**; §3.3
  enforces).
- Renders a `<TrashList items canPurge />` client component (row actions need `onClick` + `router`).
- `EmptyState` ("Trash is empty — deleted candidates appear here and can be restored.") when no items.

**Columns:** Name · Credential · Client · Status (at deletion — the still-stored `statusLabel`) ·
Deleted (relative + absolute `deletedAt`) · Deleted by (`deletedByName`) · Actions.

**`deletedBy` name resolution (§2.4 `resolveUserNames`):** `deletedById` is a `User.id`. There is no
candidate-facing user repository today; add a tiny `userRepository.namesByIds(ids)` (batch
`user.findMany({ where: { id: { in } }, select: { id, name } })`) or resolve inline in the service.
Falls back to the raw id / "Unknown" if the user was removed. **Flag OQ-1.**

**New DTO (`lib/validation/candidate.ts`)** — PII-gated summary, no `licenseNumber`:

```ts
export interface CandidateTrashItemDTO {
  id: string;
  name: string;
  credential: string | null;
  clientName: string | null;
  status: string;          // stable code
  statusLabel: string;     // status at deletion (unchanged by delete)
  deletedAt: string;       // ISO
  deletedByName: string | null;
}
export interface CandidateTrashDTO { items: CandidateTrashItemDTO[]; }
```

### 5.2 Row actions (`TrashList` client component)

- **Restore** (`Button` secondary): `POST /api/candidates/[id]/restore` → on success remove the row +
  `router.refresh()` + announce "Restored {name}". Always rendered.
- **Purge** (`Button` destructive): rendered/enabled **only when `canPurge`**; opens the purge `Modal`
  (§7). Server enforces regardless (§3.3).
- Uses `postJson`/`readFailure` + `messageForFailure` from `lib/api/client` for uniform error surfacing
  (a 403 → the friendly "You don't have permission…").

### 5.3 Nav placement (`layout.tsx` + `lib/nav.ts`)

Append **Trash** in the layout item list (like **Import**). Recommendation: **visible to all operators**
(everyone can soft-delete/restore; the Purge action inside is separately gated), placed **last**:

```ts
const items: NavItem[] = [...BASE_NAV_ITEMS];
if (hasCapability(user.role, "bulkImport")) items.push({ href: "/migration", label: "Import" });
items.push({ href: "/trash", label: "Trash" });
```
`activeNavHref` already longest-matches, so `/trash` highlights correctly. (Keeping Trash out of
`BASE_NAV_ITEMS` and appending in the layout preserves the existing pattern; if it ever becomes
capability-gated, that's a one-line guard here.) **Flag OQ-2** (visible-to-all vs. leadership-only).

---

## 6. Delete entry point (candidate detail page)

- Add a **Delete** action (destructive-tone `Button`) to `DetailHeader` (a right-aligned actions area
  alongside the `StageMover`), or a small footer actions strip in `CandidateDetail`.
- On click → a **`Modal`** confirm titled "Move to Trash?": body "This moves **{name}** to Trash. You
  can restore them later from the Trash page." + Cancel / **Move to Trash** (destructive).
- On confirm → `DELETE /api/candidates/[id]` via `postJson`-style fetch; on success
  `router.push("/pipeline")` (or `/candidates`) and surface a toast/`aria-live` "Moved {name} to
  Trash." The candidate is now gone from board/list/detail (D-9); navigating back to `/candidates/[id]`
  yields 404 (detail `getCandidateDetail` uses `findById`, which excludes soft-deleted).
- Reversible → **simple confirm** (no type-to-confirm). New small client component
  `DeleteCandidateButton` (owns modal open state + the fetch), reusing `Modal`/`Button`.

---

## 7. Purge UX (irreversible — type-to-confirm `Modal`)

`PurgeCandidateModal` (client), opened from a Trash row's Purge button (only for `canPurge`):

- Title: "Purge permanently?" Destructive framing.
- Body spells out the **cascade** explicitly: "This **permanently deletes** {name} **and all of their
  documents, notes, and stage history.** This cannot be undone."
- A **type-to-confirm** input: the **Purge permanently** button is disabled until the operator types the
  candidate's exact `name` (trim + case-sensitive match shown next to the input). This is the friction
  that separates purge from restore.
- Confirm → `POST /api/candidates/[id]/purge`; on success remove the row + `router.refresh()` + announce
  "Purged {name}." A `403` (e.g. capability changed mid-session) → `messageForFailure` friendly text.
- Modal only mounts for capability holders; the **server re-checks** `purgeCandidate` (§3.3) so a forged
  request from a non-holder is rejected regardless.

---

## 8. Interaction with pagination / filters (confirmation)

- **Board / flat list / dashboard funnel** already exclude soft-deleted: `buildCandidateWhere` sets
  `deletedAt: null` unless `includeDeleted`; `groupByStatus`/`groupByStatusFiltered`/`listStaleActive`
  hard-code `deletedAt: null`. **Deleting a candidate removes it from every default view automatically**
  — no change needed.
- **Restore** clears `deletedAt` only → the candidate reappears in its **existing stage** (status/timing
  never touched by delete or restore).
- **Trash** is the only surface that reads `deletedAt != null` (via `listDeleted`), so the two worlds
  never overlap.

---

## 9. Tests

**Repository (`candidate.repository.test.ts`)**
- `purge` hard-deletes the candidate **and cascades**: seed a candidate + a `Document` + `CandidateNote`
  + `StageHistory`, `purge`, assert all four rows are gone.
- `listDeleted` returns **only** soft-deleted rows, ordered `deletedAt desc`; excludes live rows.

**Service (`candidate.service.test.ts`)**
- `softDelete` writes an **audit** row (`action: "delete"`) and the candidate no longer appears in
  `listCandidates` / board reads (excluded by default).
- `softDelete` on a missing/already-deleted candidate → `NOT_FOUND` (idempotent).
- `restore` returns the candidate to `listCandidates` **at its original stage**, writes `action:
  "restore"`; `restore` on a live (non-trashed) candidate → `CONFLICT`; on missing → `NOT_FOUND`.
- `purge` **requires the capability**: a Screener/Associate → `FORBIDDEN` and the candidate still
  exists; an Owner/Admin succeeds, cascades, and writes `action: "purge"` (the audit row **persists**
  after the cascade).
- `purge` on a **live** candidate → `CONFLICT` (trash-only, D-4); on missing → `NOT_FOUND`.
- `listTrash` returns **only** soft-deleted candidates, PII-gated (no `licenseNumber` for a viewer
  without `viewCredentials`), with `deletedByName` resolved.

**Routes**
- `DELETE /api/candidates/[id]`: 401 unauth; 200 soft-deletes (audited); 404 missing.
- `POST …/restore`: 200 restores; 401 unauth; 409 if not in Trash.
- `POST …/purge`: **403 without `purgeCandidate`** (candidate untouched); 200 with it (cascade); 401
  unauth; 409 on a live candidate.

**UI (component/RTL, if in scope)**
- Trash `EmptyState` when no deleted candidates.
- Purge button **not rendered** for a viewer without `canPurge`.
- Purge modal's confirm button stays **disabled** until the typed name matches.
- Delete-confirm modal dismisses without deleting on Cancel/ESC.

---

## 10. Open questions / assumptions

- **OQ-1 — `deletedBy` name resolution.** No candidate-facing user repository exists today. Assumption:
  add `userRepository.namesByIds(ids)` (or resolve inline in `listTrash`) reading the Better Auth `User`
  table; fall back to "Unknown" when the actor was removed. Confirm this is the desired source.
- **OQ-2 — Trash nav visibility.** Recommended **visible to all operators** (delete/restore are open;
  Purge is separately gated). Alternative: gate the nav item (and the whole `/trash` page) behind a
  leadership capability so only leadership sees Trash. Confirm.
- **OQ-3 — Document blob cleanup on purge.** The cascade removes `Document` **rows**. If/when documents
  reference external managed storage (blob/file), purge must also delete the underlying objects — out of
  scope here; revisit when file storage lands.
- **OQ-4 — Retention / auto-purge.** No automatic purge-after-N-days is proposed (manual, admin-only).
  Ethiopian DPP 1321/2024 / HIPAA may impose retention or right-to-erasure timelines — confirm with the
  Owner whether a scheduled retention job is required (would be a separate wave).
- **OQ-5 — Purge on a still-live candidate.** This design **forbids** it (D-4, trash-then-purge). If the
  Owner wants a one-step "delete forever" for admins, relax the §2.3 `CONFLICT` guard and add a
  live-candidate branch to the purge modal. Recommend keeping the two-step gate.
- **Assumption — capability scope.** `purgeCandidate` currently grants to **Owner + Admin only**
  (`roles.ts`), not Director/Manager. The task brief said "admin/leadership"; this design follows the
  **code** (admin-only). If leadership should purge, add `purgeCandidate` to `LEADERSHIP_CAPABILITIES` —
  a `roles.ts` change, out of scope for this wave.
