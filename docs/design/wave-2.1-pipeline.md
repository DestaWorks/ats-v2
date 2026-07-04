# Wave 2.1 — Pipeline Board (Module 3) Design — *first slice*

**Status:** design (architect). Backend/frontend implement routes + service reads + client board + tests
from this spec. **Design only — no implementation, no migration, no commit.** Conforms to `DECISIONS.md`
(wins on conflict), `IMPLEMENTATION-PLAN.md` §2.1, `STACK-ARCHITECTURE.md`, `CONVENTIONS.md`,
`MODULE-BREAKDOWN.md` §5 (Pipeline), and the existing Wave 1.1 candidate build.

**Feature:** a kanban pipeline board that renders candidates in stage columns and lets a recruiter drag a
card to a new stage — **server-authoritative** (invalid moves blocked by the stage gate, reverted +
explained on the client), **every move audited**. Plus a real `/dashboard` (funnel counts + recent +
overdue/stuck) replacing the Wave 0.3 placeholder. Ports `legacy/index.html` ~2539–2740 (chips/filters/
kanban columns/cards + HTML5 DnD) 1:1 in behavior, on `@dnd-kit` instead of hand-rolled HTML5 DnD.

**Reuses (does NOT rebuild):** `candidateService.move(id, toStatus, user)` (gate → txn update +
stage_history + audit), `candidateRepository.list(filters)`, `toCandidateDTO` (PII gate),
`checkStageGate`/`canTransition` (isomorphic — pure, no `server-only`), `getDaysInStage`/`isOverdue`/
`isStuck`, `apiHandler`/`AppError`, `requireUser`, `PIPELINE_STAGES` + helpers, and the UI primitives
(`Field`/`Spinner`/`EmptyState`/`ErrorState`/`Skeleton`) + Tailwind status tokens (`--color-status-*`).

---

## Headline decisions

| # | Decision |
|---|----------|
| **P-1** | **Data fetching = RSC initial load + React 19 `useOptimistic` + `fetch` to the existing gated move route.** No TanStack Query, no Server Action, in this slice. Justified in §0. |
| **P-2** | **`GET /api/candidates` returns funnel-grouped board data** (per active stage: `count` + `candidates: CardDTO[]`), plus a terminal **summary** (counts; lists only when `includeTerminal=1`) and a `meta` block. The client renders columns directly — no client-side grouping. |
| **P-3** | **Board columns = the 9 active stages** (`ACTIVE_STATUS_CODES`, order 0–8). The 4 terminal states render in a **collapsed side rail** (counts), NOT as main columns. You can move a card *into* a terminal state via the per-card status `<select>` (a11y fallback), not by dragging onto the board. |
| **P-4** | **The client pre-checks drop validity with the same `checkStageGate`** (isomorphic) to dim/disable invalid drop targets — but the **server is the sole authority**. On a server `STAGE_BLOCKED` (422) the optimistic move **reverts + a toast lists the blocking reasons**. |
| **P-5** | **Card carries the gate-relevant fields** (track, credential, licenseState, licenseStatus, population, setting, clientId) plus a derived **`hasContact: boolean`** — never raw email/phone, **never `licenseNumber`**. Name is PII but the board is behind auth (fine). |
| **P-6** | **Score is NOT shown on cards** in this slice — `scoreCandidate` needs the `client_rules` table (a later wave). Card shows track/credential/license/client/days-in-stage/overdue-stuck badge. Noted as deferred. |
| **P-7** | **Bulk-move endpoint + service ship now (no gate bypass); the bulk-select UI is deferred.** `bulkMove` runs the gate per-id, **each candidate in its own transaction**, and returns a **partial-success summary** (`moved` / `blocked[]`) — one blocked candidate never rolls back the valid moves. Fixes the legacy asymmetry (legacy drag = gated, legacy bulk = ungated). |
| **P-8** | **Filters live in the URL `searchParams`** (`track`, `client`, `q`), per DECISIONS (shareable filters → URL, not localStorage). Saved views + the 5 chip predicates (mine/overdue/stuck/hot/verify) are **deferred** to the follow-up (they bring the `saved_views` model). |
| **P-9** | **Client-side stage-gate pre-check DEFERRED** (engineer sign-off, review M2). The card DTO deliberately omits `population`/`setting`/`hasContact` (smaller PII surface), so the client can't faithfully mirror `checkStageGate`. The **server remains the sole authority** — an invalid drag/select simply reverts with a toast of the blocking reasons. The follow-up can add a minimal client mirror (dim invalid columns + disable invalid `<select>` options) if the jump-then-revert UX proves annoying. |

---

## 0. Data-fetching / mutation approach (P-1) — recommendation + justification

**Recommendation:** for this first cut,

1. **Initial render** — the board page is a **Server Component** that calls a read service directly
   (`candidateService.listBoard({})`) and passes the grouped payload as `initial` to the client board.
   SSR, no client fetch on first paint, no loading flash.
2. **Filter changes** — the client board re-fetches `GET /api/candidates?...` (the same shape) and swaps
   its base state. (Alternatively `router.refresh()` with `searchParams` — see OQ-4.)
3. **Moves** — client wraps the move in a React 19 **`useOptimistic`** transition, **`fetch`es the existing
   `POST /api/candidates/:id/move` route**, and on failure lets the optimistic state snap back to base +
   toasts the reason.

**Why `useOptimistic` + `fetch` (not TanStack Query, not a Server Action) now:**
- **No new dependency / provider.** TanStack Query needs a `QueryClientProvider` and a caching story
  that only pays off once multiple views share candidate state (table view, detail modal). This slice
  has one view. `useOptimistic` is already in React 19 — zero install, zero provider.
- **One authority path.** The move route already exists, is gated, audited, and returns the uniform
  `AppError` envelope (incl. `STAGE_BLOCKED` → 422). A Server Action would be a *second* server entry
  point to the same logic (and can't be called from the plain `<select>` fallback as cleanly). Reusing
  the route keeps a single audited path and a single error contract.
- **The UX contract is preserved.** DECISIONS §"Optimistic updates" mandates *optimistic move +
  rollback, no visible snap-back on success*. `useOptimistic` delivers exactly that: the card shows in
  the target column instantly; on success we commit the returned DTO to base state (no snap); on a gate
  block the base state never changed, so it reverts and we toast.
- **DECISIONS calls out TanStack Query for server-state** (line 98). This slice **defers** it as an
  explicit, scoped simplification — flagged as **OQ-1** for the orchestrator. TanStack can layer in when
  the table view + detail modal need cross-view caching; the endpoints designed here are the same ones
  those hooks would consume, so nothing is thrown away.

---

## 1. Endpoint contracts

All three routes: `apiHandler`-wrapped, `requireUser()` (any signed-in user works the pipeline — no
candidate-specific capability, per `candidate.service.ts` authZ note), zod-validated boundary, uniform
`{ error: { code, message } }` envelope on failure.

### 1.1 `GET /api/candidates` — funnel-grouped board data

**File:** `src/app/api/candidates/route.ts`

**Query params** (zod, all optional):

```ts
const listQuerySchema = z.object({
  track: z.enum(TRACKS).optional(),                 // "Clinical" | "Prescriber" | "Operations"
  client: z.string().min(1).optional(),             // clientId
  q: z.string().trim().min(1).max(100).optional(),  // free text → name/email (repo `search`)
  includeTerminal: z.coerce.boolean().optional().default(false),
});
```

**Auth:** `requireUser()`. **Delegates to** `candidateService.listBoard(filters, user)`.

**200 response:**

```ts
interface BoardResponse {
  columns: BoardColumn[];   // exactly the 9 active stages, order 0..8, always present (even if empty)
  terminal: TerminalSummary; // 4 terminal states: counts always; `candidates` only if includeTerminal
  meta: { total: number; activeTotal: number; overdue: number; stuck: number };
}
interface BoardColumn {
  code: CandidateStatus;     // e.g. "SUBMITTED_TO_CLIENT"
  label: string;             // statusLabel(code)
  order: number;             // stageOrder
  slaDays: number | null;
  count: number;
  avgDaysInStage: number;    // legacy column subtitle
  candidates: CardDTO[];
}
interface TerminalSummary {
  states: { code: CandidateStatus; label: string; count: number; candidates?: CardDTO[] }[];
  count: number;
}
```

`CardDTO` (§2.3). Soft-deleted rows excluded (repository default). Terminal candidates are excluded from
`columns` and summarized in `terminal`.

### 1.2 `POST /api/candidates/:id/move` — single gated move

**File:** `src/app/api/candidates/[id]/move/route.ts`

```ts
const moveBodySchema = z.object({ toStatus: z.enum(ALL_STATUS_CODES) });
```

`requireUser()` → `candidateService.move(params.id, body.toStatus, user)` (unchanged existing method).

- **200** `{ candidate: CardDTO }` (the moved card, re-projected — includes fresh `stageEnteredAt`,
  `daysInStage: 0`, cleared overdue/stuck).
- **422** `STAGE_BLOCKED` → `{ error: { code: "STAGE_BLOCKED", message: "Credential required; License state required" } }`.
  The message is the `checkStageGate` reasons joined with `"; "` (existing behavior). **Client splits on
  `"; "` to render a bulleted list** — no server change. (Structured `reasons: string[]` is a nice-to-have,
  OQ-2.)
- 404 `NOT_FOUND` (missing/soft-deleted), 400 `BAD_REQUEST` (unknown status — defended in `move`), 401.

### 1.3 `POST /api/candidates/bulk-move` — gated bulk move, **no bypass**

**File:** `src/app/api/candidates/bulk-move/route.ts`

```ts
const bulkMoveSchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(100),
  toStatus: z.enum(ALL_STATUS_CODES),
});
```

`requireUser()` → **new** `candidateService.bulkMove(ids, toStatus, user)`. **Every id runs the same
`checkStageGate`** (P-7). Partial success — **200** with a summary:

```ts
interface BulkMoveResponse {
  moved: string[];                                   // ids successfully moved
  blocked: { id: string; reasons: string[] }[];      // gate-blocked (or not found)
  toStatus: CandidateStatus;
}
```

**Service:** loop ids; for each, reuse the existing single-move logic (find → gate → txn
update+history+audit) **per candidate in its own transaction**; collect blocked/not-found instead of
throwing on the first. Rationale: a bulk sweep of 40 cards must not lose 39 valid moves because 1 lacks a
credential. Not all-or-nothing.

---

## 2. Server read layer + DTO

The board/dashboard need **grouping + derived timing + client name**, which no existing method returns.
Add **read methods to `candidateService`** (services own authZ + own the DTO shape; routes/RSC never touch
Prisma). They build on `candidateRepository.list` (unchanged).

### 2.1 `candidateService.listBoard(filters, user)`

1. `requireUser()` is done by the caller (route) / `getCurrentUser` (RSC); the method takes `user`.
2. `rows = candidateRepository.list({ track, clientId: client, search: q })` (soft-delete excluded).
3. Fetch the **clients table once** (6 rows) → `Map<id, name>`; attach `clientName` (avoids a per-row
   join and does **not** modify the shared `list`).
4. `now = new Date()`; map each row → `CardDTO` (§2.3) with `daysInStage = getDaysInStage(stageEnteredAt,
   now)`, `overdue = isOverdue(status, stageEnteredAt, now)`, `stuck = isStuck(stageEnteredAt, now)`.
5. **Group** into the 9 active columns via a pure helper `groupByStage(cards)` (unit-tested, §5); compute
   `avgDaysInStage` per column; bucket terminal cards into `terminal`.
6. `meta.overdue/stuck` = counts across active cards.

### 2.2 `candidateService.funnel(user)` (dashboard)

Same read, returns lighter data: `{ stages: { code, label, count }[] (active), activeTotal, overdue,
stuck, recent: CardDTO[] (latest N=8 by createdAt) }`.

### 2.3 `CardDTO` (client-safe card projection)

Derived from `toCandidateDTO(row, user)` (PII boundary) then narrowed for the board:

```ts
interface CardDTO {
  id: string;
  name: string;                 // PII — board is auth-gated (OK); licenseNumber NEVER present
  track: Track;
  credential: string | null;
  licenseState: string | null;
  licenseStatus: LicenseStatus;
  population: string | null;    // gate input (SUBMITTED path etc.)
  setting: string | null;
  clientId: string | null;
  clientName: string | null;
  hasContact: boolean;          // = Boolean(email || phone) — for the isomorphic gate pre-check, no raw PII
  status: CandidateStatus;
  stageOrder: number;
  stageEnteredAt: string;       // ISO
  daysInStage: number;
  overdue: boolean;
  stuck: boolean;
  tags: string[];
}
```

`hasContact` is computed server-side so the wire never carries email/phone (not shown on a card) while the
client gate pre-check still knows contact exists.

---

## 3. Client component tree

```
src/app/(app)/pipeline/page.tsx            (RSC) auth → listBoard({}) → <PipelineBoard initial=… />
  └─ pipeline-board.tsx                     ("use client") DndContext, base state + useOptimistic, move flow
       ├─ board-filters.tsx                 track/client <select> + text search → URL searchParams
       ├─ board-column.tsx                  useDroppable; header (dot+label+count+avg days); card list; EmptyState "Empty"
       │    └─ candidate-card.tsx           useDraggable/useSortable; card content; per-card status <select> fallback
       ├─ terminal-rail.tsx                 collapsed side rail: 4 terminal states + counts (expand → includeTerminal fetch)
       └─ lib/
            ├─ optimistic-move.ts           pure reducer: applyMove(state,id,toStatus) / used by useOptimistic (§5)
            ├─ card-gate.ts                  cardToRuleCandidate(card) → reuse checkStageGate (isomorphic)
            └─ board-fetch.ts               fetch helpers + error-envelope → user message (mirrors resume-flow messageForError)

src/app/(app)/dashboard/page.tsx           (RSC, REWRITE) funnel + recent + overdue/stuck + link → /pipeline
  └─ funnel-bar.tsx / stat-card.tsx         presentational
```

### 3.1 Move flow (optimistic + revert)

`PipelineBoard` holds **base state** (`useState`, seeded from `initial`) and layers **`useOptimistic`** on
top for in-flight moves.

```
onDrop(cardId, toStatus)  // from DnD OR from the per-card <select>
  1. Client pre-check: canDropCard(card, toStatus) via checkStageGate. If blocked → toast the reasons,
     DO NOT fire the request (UX guard; server still authoritative if this is ever stale).
  2. startTransition(() => addOptimistic({ type:"move", id, toStatus }))   // card jumps to target column
  3. const res = await fetch(`/api/candidates/${id}/move`, { method:"POST", body:{ toStatus } })
  4a. ok      → setBase(commitMove(base, returnedCard))  // commit; no snap-back (DECISIONS contract)
  4b. 422     → toast.error("Can't move to <label>", { description: reasons }) ; base unchanged → optimistic reverts
  4c. other   → toast.error(genericMessage) ; base unchanged → reverts
  5. announce(liveRegion, `${name} moved to ${label}` | `Move blocked: ${reasons}`)
```

`useOptimistic` auto-reverts to base when the action settles without a matching base update — that IS the
revert. No `setTimeout(load, 1500)` (the legacy hack).

### 3.2 dnd-kit wiring

- `<DndContext sensors={[PointerSensor, KeyboardSensor(sortableKeyboardCoordinates)]} onDragEnd=…
  accessibility={{ announcements }}>`.
- Columns are `useDroppable({ id: stageCode })`; cards are `useDraggable({ id: cardId })` (a plain
  draggable is enough — we don't need intra-column ordering; drop target = column).
- `onDragEnd`: if `over.id !== active card's current status` → `onDrop(active.id, over.id)`.
- **Invalid-target affordance:** during drag, columns where `canDropCard(activeCard, col.code) === false`
  get `aria-disabled` + a dimmed style and are skipped in `onDragEnd` (mirror the server gate — still not
  the authority).

---

## 4. Card, filter, dashboard specs

### 4.1 Card (`candidate-card.tsx`) — ports legacy card 1:1

- **Name** (serif, prominent). **Track badge**: `CLIN` (teal) / `RX` (navy) / `OPS` (purple) — token
  `--color-teal/navy/purple` at `18%` bg, matching legacy.
- **Credential · licenseState** line (+ `COMPACT` chip if compact-license state — reuse existing
  `isCompactState`/states constant if present, else defer the compact chip).
- **Client** name (muted "Unassigned" if null).
- **Footer:** license-status dot (Active=green, Expired=red, else orange) + **days-in-stage** with an
  **overdue/stuck badge** (`overdue Nd` red / `stuck` orange / `Nd` gray) from the DTO flags.
- **Left border accent:** overdue→orange / stuck→orange (drop the legacy disqualify-red for now — auto-
  disqualify is a later rule surface).
- **NO score** (P-6). **NO licenseNumber** (P-5).
- **a11y fallback:** a visually-subtle `<select>` "Move to…" listing valid stages (active + terminal) with
  invalid ones `disabled` via `canDropCard`; `onChange` → same `onDrop`. This makes every move possible
  without a pointer and without keyboard-DnD.

### 4.2 Filters (`board-filters.tsx`)

- **Track** `<select>` (`TRACKS`), **Client** `<select>` (clients table), **text search** input (debounced
  ~300ms → `q`). Each writes `searchParams` via `router.replace(pathname?…, { scroll:false })`.
- Board reads `searchParams` (or re-fetches `GET /api/candidates?…`) and updates base state. A "Clear"
  button resets. Uses `Field` for labels where a label is needed; `<select>`/`<input>` styled with the
  shared input tokens.
- **Deferred:** the 5 chips (mine/overdue/stuck/hot/verify) + saved views (§P-8).

### 4.3 Dashboard (`dashboard/page.tsx`, rewrite)

Replaces the capability-check placeholder. RSC: `getCurrentUser()` → redirect if null → `funnel(user)`.

- **Funnel:** a horizontal bar per active stage (`FunnelBar`: label + count + proportional bar in the
  stage token color). Cumulative/linear — counts per stage.
- **Stat row:** Active total · **Overdue** (red) · **Stuck >7d** (orange).
- **Recent candidates:** latest 8 (name + stage badge + days-in-stage), each linking into the board.
- **CTA:** "Open pipeline board" → `/pipeline`.
- Async states: this is RSC (no client loading) but the recent/funnel sections use `EmptyState` when
  there are no candidates. Keep `viewReports` capability gate for any leadership-only widget added later.

---

## 5. Accessibility

- **Keyboard DnD:** dnd-kit `KeyboardSensor` + `sortableKeyboardCoordinates` — Space/Enter picks up,
  arrows move between columns, Space drops, Esc cancels.
- **Non-DnD fallback:** the per-card **"Move to…" `<select>`** (§4.1) — every move is achievable with no
  drag at all (keyboard or pointer). This is the primary a11y guarantee; DnD is an enhancement.
- **Columns:** `role="group"` (or a labelled list) with `aria-label="{label} — {count} candidates"`;
  card list is a `<ul>`/`<li>`.
- **Cards:** `aria-roledescription="draggable candidate card"`, `aria-label="{name}, {credential},
  {stage}, {daysInStage} days in stage{, overdue}"`.
- **Live region:** one polite `aria-live` region in `PipelineBoard`; on every move outcome announce
  "`{name}` moved to `{stage}`" or "Move blocked: `{reasons}`". dnd-kit `announcements` covers pickup/
  drop; the outcome announcement covers the async server result.
- **Toasts** (Sonner, already global) mirror the announcement for sighted users; `richColors` for
  success/error.
- Respects `prefers-reduced-motion` (globals.css already disables the Skeleton pulse; keep DnD transforms
  minimal).

---

## 6. Tests (mock repositories/service — no DB)

Vitest, mirroring `save.route.test.ts` (hoisted mocks: `server-only`, `next/headers`, `auth`, and the
service). **DECISIONS/CONVENTIONS §"authorization-failure": every guarded route has a 401 test.**

**Service (`candidate.service.test.ts` additions):**
- `bulkMove` — mixed batch: some pass the gate, some blocked → `moved` + `blocked[{id,reasons}]`; **no
  bypass** (each id hits `checkStageGate`); one blocked id does **not** roll back the others (per-txn).
- `bulkMove` — not-found id lands in `blocked`, doesn't throw.
- (single `move` gating already covered by the existing test — assert `STAGE_BLOCKED` still thrown.)

**Read service (`candidate.listBoard`):**
- Grouping: rows across active + terminal → exactly 9 active columns (order 0..8, empties present),
  terminal bucketed into `terminal`; `count`/`avgDaysInStage`/`meta.overdue`/`meta.stuck` correct.
- Filters passed through to `repository.list` (track/client/q); `clientName` resolved from the map.
- `CardDTO` **never** includes `licenseNumber`; `hasContact` reflects email||phone.

**Routes:**
- `GET /api/candidates`: 401 unauth; 200 returns `columns/terminal/meta`; bad query → 422 (zod).
- `POST /api/candidates/:id/move`: 401; 200 happy (forwards authed user to `move`); **422 STAGE_BLOCKED**
  (service throws → envelope with the joined reasons); 400 unknown status; 404.
- `POST /api/candidates/bulk-move`: 401; 200 partial summary (`moved`/`blocked`); empty/oversized `ids`
  → 422 (zod); **proves gate runs for every id** (no bypass).

**Client pure helpers (no React):**
- `optimistic-move.applyMove(state, id, toStatus)` — moves the card between column arrays, updates the
  card's `status/stageOrder`; **revert** = re-render from unchanged base (assert `applyMove` is pure /
  returns new state, base untouched).
- `card-gate.cardToRuleCandidate` + `canDropCard` — a card missing credential is blocked for
  `QUALIFIED_PRESCREEN` (Clinical) but allowed for Operations with `hasContact` — proving the client
  pre-check reuses `checkStageGate` and matches the server.

---

## 7. Deferred (rest of 2.1 — follow-up PR, not designed deeply here)

Explicitly **out of scope** for this slice (IMPLEMENTATION-PLAN §2.1 continues):
- **Table view** + sortable tri-state columns + advanced filter panel (legacy ~2740–2824).
- **`saved_views` model** + migration + shareable saved views + the **5 chip predicates**
  (mine/overdue/stuck/hot/verify). URL `searchParams` is the foundation this builds on.
- **Bulk-select UI + bulk actions** (the `bulk-move` **endpoint/service ship now**; only the selection UI
  is deferred).
- **AI health strip** (`server/ai/pipeline-health` — provider-agnostic, needs a key; `ats_pipeline_health`).
- **Score on cards / hot-match chip** — needs the `client_rules` table (`scoreCandidate(candidate,
  clientRules)`), a later wave.
- **TanStack Query** `useCandidates`/`useMoveCandidate` hooks (adopt when table + detail views share
  cache; endpoints here are already the shape those hooks consume).
- **Auto-disqualify chips** on cards.

---

## 8. Open questions / assumptions (flag — do not guess)

- **OQ-1 (needs a call):** this slice **defers TanStack Query** (DECISIONS line 98 nominates it for
  server-state) in favor of `useOptimistic` + `fetch`. Recommended as a scoped simplification with the
  same UX contract; confirm the orchestrator accepts deferral vs. wanting TanStack wired now.
- **OQ-2:** `STAGE_BLOCKED` currently carries reasons as a `"; "`-joined **string**. This slice assumes
  the client splits on `"; "` for a bulleted list (no server change). If a structured `reasons: string[]`
  in the envelope is preferred, it's a small `AppError`/`api-handler` enhancement — confirm.
- **OQ-3:** **Bulk-move partial-success (200 + summary)** vs. all-or-nothing (422 if any blocked).
  Recommended: partial (P-7). Confirm this matches the intended recruiter workflow.
- **OQ-4:** Filter refresh mechanism — client re-`fetch` of `GET /api/candidates` (keeps the client the
  source of board state, plays cleanly with `useOptimistic`) **vs.** `router.refresh()` re-running the RSC
  with `searchParams` (simpler, but re-render fights in-flight optimistic moves). Recommended: **client
  re-fetch**. Confirm.
- **OQ-5:** Route base path — assumed **`/pipeline`** for the board (dashboard stays `/dashboard`). Legacy
  had one "Pipeline" view with a Kanban/Table toggle; since table is deferred, a single `/pipeline`
  board is assumed. Confirm the desired nav/route name.
- **Assumption:** any signed-in user may move candidates (matches `candidateService` authZ note — no
  candidate capability; Screener/Associate are the primary workers). PII `licenseNumber` never reaches a
  card regardless of role (cards omit it entirely).
- **Assumption:** the `(app)` segment has **no shared layout** today, so `/pipeline/page.tsx` does its own
  `getCurrentUser()` → `redirect("/sign-in")` guard (mirrors `dashboard/page.tsx`).
- **Assumption:** `clients` table is small (6 seed rows) → fetch-all + in-memory `id→name` map is fine;
  no need to add an `include` to the shared `repository.list`.
```
