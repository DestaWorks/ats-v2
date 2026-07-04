# Candidate Scoring — Feature Design (architect)

**Status:** design (architect). Backend/frontend implement schema + seed + service wiring + DTO fields +
UI from this spec. **Design only — no implementation, no migration, no commit.** Conforms to
`DECISIONS.md` (wins on conflict), `DATA-MODEL.md`, `docs/design/wave-2.1-pipeline.md` (the board this
feeds), `docs/design/wave-1.1-candidate-schema.md`, `STACK-ARCHITECTURE.md`, and `CONVENTIONS.md`.

**Feature:** wire the already-built, tested-but-dormant `scoreCandidate` into the live app. The pure
rule (`src/lib/rules/scoring.ts`) computes a candidate's fit **for their assigned client** out of 100
(State 30 · Credential 30 · Population 20 · Setting 10 · License 10), returning `{ score, max, pct,
flags }`. Today it is computed **nowhere** — because scoring rules are **DATA, not code** (DECISIONS),
and the `client_rules` table that holds that data **does not exist yet**. This slice: (1) adds the
`client_rules` model + seed, (2) loads rules in the read services and folds a `score` into the board /
list / detail DTOs, (3) surfaces the score in the UI (badge + hot chip + flags breakdown + list sort).

**Reuses (does NOT rebuild):** `scoreCandidate(candidate, clientRules)` + `getAutoDisqualify` +
`ClientRules`/`RuleCandidate` (`src/lib/rules/*`), `toRuleCandidate` (`candidate.dto.ts`), the
`clientId → name` map already built in `listBoard` / `listCandidates` / `getCandidateDetail`
(`candidate.service.ts`), `clientRepository`, the `BASE_CLIENTS` seed pattern (`scripts/seed-clients.ts`),
the `Badge` primitive, and the existing card / list-item / detail DTOs (`lib/validation/*`).

---

## Headline decisions

| # | Decision |
|---|----------|
| **S-1** | **`client_rules` is a new Prisma model, 1:1 with `Client`** (`clientId @unique`, `onDelete: Cascade`), holding `states`/`creds`/`pops`/`settings` (`String[]`) plus `priority String?` and `autoDisqualify String[]`. Seeded from a new `BASE_CLIENT_RULES` constant via `db:seed:rules` (idempotent by `clientId`). **Data, not code** — an editing UI is deferred to the CRM/client wave. |
| **S-2** | **Score is computed server-side only, in the read services** (`listBoard`, `listCandidates`, `getCandidateDetail`), never on the client and never in a pure DTO mapper that lacks rules. Each service loads a `clientId → ClientRules` map **once** (alongside the existing `clientId → name` map) and calls `scoreCandidate(toRuleCandidate(row), rules)`. |
| **S-3** | **`score` on the wire = the `pct` number, or `null`** when the candidate has no fit to report — i.e. **no client assigned** (`clientId == null`) **or** the assigned client has no rules row **or** the rules constrain nothing (`max === 0`, e.g. *Future Potential Clients*). `null` renders as "—", never as "0%". |
| **S-4** | **Card + list-item DTOs gain `score: number \| null`** (pct only). **Detail gains a richer `scoring` block**: `{ pct, score, max, flags, autoDisqualify }` — the detail page is the one place with room to explain *why* the score isn't 100. |
| **S-5** | **Score badge color scale: ≥ 80 green · 50–79 amber · < 50 neutral · null hidden.** A **"Hot" chip** (green, `🔥`-free text "Hot") shows when `pct ≥ 80` — the recommended hot threshold, matching the legacy hot-candidate concept. Threshold lives in one shared constant so it is not duplicated across card/list/detail. |
| **S-6** | **`/candidates` list sorts by score desc by default** (nulls last), tie-broken by the existing `createdAt desc`. Sorting is done **in the service after scoring** (score is a computed field, not a column). The **board keeps its stage grouping** — no re-sort of columns in this slice (see OQ-2). |
| **S-7** | **`getAutoDisqualify` is wired on the DETAIL page only** (a "would be auto-disqualified" warning banner), NOT as an automatic status change and NOT on cards/list. The data is now present so it is cheap; scope-guarded to *display* — it never mutates a candidate's status. |
| **S-8** | **Rules editing is DEFERRED** to the CRM/client-management wave. This slice is **read + display**; rules are seed-only. No create/update rules route, no admin UI. |

---

## 1. `client_rules` model + seed (S-1)

### 1.1 Prisma model

Add to `prisma/schema.prisma`, adjacent to `Client`, and a back-relation on `Client`:

```prisma
model Client {
  // ...existing fields...
  candidates Candidate[]
  rules      ClientRules?          // NEW — 1:1 back-relation

  @@index([deletedAt])
  @@map("clients")
}

/// Per-client scoring/matching rules — DATA, not code (DECISIONS: scoring rules live in a table,
/// consumed by the pure `scoreCandidate(candidate, clientRules)` / `getAutoDisqualify`). Exactly one
/// row per Client (1:1); deleting a Client cascades its rules. Empty arrays mean "no constraint on
/// this dimension" (that dimension contributes nothing to `max`). Editing UI is a later (CRM) wave;
/// seeded from `BASE_CLIENT_RULES` for now.
model ClientRules {
  id             String   @id @default(cuid())
  clientId       String   @unique
  client         Client   @relation(fields: [clientId], references: [id], onDelete: Cascade)
  states         String[] @default([])   // e.g. ["CT","NJ"] — matched against candidate.licenseState
  creds          String[] @default([])   // e.g. ["PMHNP","MD"] — matched against candidate.credential
  pops           String[] @default([])   // populations, e.g. ["Child/Adolescent"]
  settings       String[] @default([])   // e.g. ["Hybrid","Outpatient"]
  priority       String?                  // "HIGH" | "MED" | "STANDARD" (display / future weighting)
  autoDisqualify String[] @default([])   // human-readable hard-DQ reasons (feeds getAutoDisqualify context)
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  @@index([clientId])
  @@map("client_rules")
}
```

**Rationale for the shape:**
- **1:1 unique FK, not a JSON blob on `Client`** — arrays are first-class Postgres `String[]` (same as
  `Candidate.tags`), queryable and diffable, and a dedicated table keeps the small `Client` row lean and
  matches the wave-1 "scoring rules land in a later table" note in `clients.ts`.
- **`onDelete: Cascade`** — rules are meaningless without their client; a client delete should take its
  rules with it. (Contrast `Candidate.clientId onDelete: SetNull` — candidates outlive a client; rules
  don't.)
- **`priority` is `String?`** (nullable), not an enum — keep the migration cheap and tolerate legacy
  values; the app treats unknown values as "STANDARD". `autoDisqualify` is stored as data so
  `getAutoDisqualify` messaging can key off it later, but the *logic* stays in the pure rule.
- **`ClientRules` maps to `ClientRule` type name concern:** the Prisma model is `ClientRules` (plural,
  matching the domain term and the pure-rule interface `ClientRules`); the table is `client_rules`.

**Note on the pure `ClientRules` interface (`src/lib/rules/types.ts`):** it has exactly
`{ name, states, creds, pops, settings }` (readonly). The service builds that shape from a
`ClientRules` **row + its client's `name`** (see §2). The rules row itself does not store `name`
(that's on `Client`) and the score rule does not read `priority`/`autoDisqualify` — those two feed the
detail UI (`priority`) and `getAutoDisqualify` (`autoDisqualify`) respectively.

### 1.2 `BASE_CLIENT_RULES` constant

New export in `src/lib/constants/clients.ts` (re-exported via `constants/index.ts`), keyed to
`BASE_CLIENTS` by the client **name** (which equals `legacyId`), so the seed can resolve `clientId`.
Every value below is drawn from the ground-truth legacy `CLIENT_RULES` and validated against the
existing `CREDENTIALS` / `POPULATIONS` / `SETTINGS` constants (all present — no unknown tokens):

```ts
export interface BaseClientRules {
  clientName: string; // matches BASE_CLIENTS[].name (== legacyId)
  states: readonly string[];
  creds: readonly string[];
  pops: readonly string[];
  settings: readonly string[];
  priority: "HIGH" | "MED" | "STANDARD";
  autoDisqualify: readonly string[];
}

export const BASE_CLIENT_RULES: readonly BaseClientRules[] = [
  {
    clientName: "Sterling Institute",
    states: ["CT"],
    creds: ["PMHNP", "PMHNP-BC", "MD", "DO", "PsyD", "PhD"],
    pops: ["Child/Adolescent"],
    settings: ["Hybrid", "Outpatient"],
    priority: "HIGH",
    autoDisqualify: ["No CT license", "No child/adolescent experience"],
  },
  {
    clientName: "Contemporary Care",
    states: ["CT", "NJ", "FL"],
    creds: ["PMHNP", "PMHNP-BC", "MD", "DO", "LCSW", "LPC", "LMHC", "LMFT"],
    pops: [],
    settings: ["Hybrid", "Outpatient", "Telehealth"],
    priority: "MED",
    autoDisqualify: ["License must match position state"],
  },
  {
    clientName: "DOCs Medical Group",
    states: ["CT"],
    creds: ["PMHNP", "PMHNP-BC", "MD", "DO"],
    pops: [],
    settings: ["Outpatient"],
    priority: "STANDARD",
    autoDisqualify: ["No CT license", "On-site only — no telehealth"],
  },
  {
    clientName: "Ritu Suri & Associates",
    states: ["CT", "NY"],
    creds: ["PMHNP", "PMHNP-BC", "MD", "DO", "PsyD"],
    pops: [],
    settings: ["Outpatient", "Hybrid", "Telehealth"],
    priority: "MED",
    autoDisqualify: [],
  },
  {
    clientName: "NJ-Psych Candidates",
    states: ["NJ"],
    creds: ["PMHNP", "PMHNP-BC", "MD", "DO", "PsyD", "PhD", "LCSW", "LPC"],
    pops: [],
    settings: [],
    priority: "MED",
    autoDisqualify: ["NJ license required"],
  },
  {
    clientName: "Future Potential Clients",
    states: [],
    creds: [],
    pops: [],
    settings: [],
    priority: "STANDARD",
    autoDisqualify: [],
  },
] as const;
```

### 1.3 Seed script + npm script

`scripts/seed-rules.ts` (mirrors `seed-clients.ts`), run **after** `db:seed:clients` (needs the clients
to exist to resolve `clientId`). Idempotent — upsert by `clientId`:

```ts
import "dotenv/config";
import { prisma } from "@/server/db/prisma";
import { BASE_CLIENT_RULES } from "@/lib/constants";

async function main() {
  for (const r of BASE_CLIENT_RULES) {
    const client = await prisma.client.findFirst({ where: { name: r.clientName } });
    if (!client) {
      console.warn(`⚠ Skipped rules for "${r.clientName}" — client not found (run db:seed:clients first)`);
      continue;
    }
    await prisma.clientRules.upsert({
      where: { clientId: client.id },
      create: {
        clientId: client.id,
        states: [...r.states], creds: [...r.creds], pops: [...r.pops], settings: [...r.settings],
        priority: r.priority, autoDisqualify: [...r.autoDisqualify],
      },
      update: {
        states: [...r.states], creds: [...r.creds], pops: [...r.pops], settings: [...r.settings],
        priority: r.priority, autoDisqualify: [...r.autoDisqualify],
      },
    });
    console.log(`✓ Seeded rules: ${r.clientName}`);
  }
  console.log(`Done — ${BASE_CLIENT_RULES.length} client-rules upserted.`);
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
```

`package.json`:
```json
"db:seed:rules": "NODE_OPTIONS=--conditions=react-server tsx scripts/seed-rules.ts"
```
Resolve `clientName` by `name` (not `legacyId`) since `Future Potential Clients` etc. are matched by
name in the ground truth; `name == legacyId` for all `BASE_CLIENTS`, so either works — pick `name` and
document it. Run order after any fresh migrate: `db:seed` → `db:seed:clients` → `db:seed:rules`.

---

## 2. Service wiring (S-2, S-3, S-4)

### 2.1 A rules repository + a `clientId → ClientRules` map

Add a `clientRulesRepository` (the only layer touching Prisma for rules) with one read:

```ts
// src/server/repositories/client-rules.repository.ts
export const clientRulesRepository = {
  list(tx?: Prisma.TransactionClient) {
    return db(tx).clientRules.findMany();   // small table (one row per client)
  },
};
```

**Do NOT `include` rules on every candidate query.** Follow the existing pattern: the `client_rules`
table is tiny (a handful of rows), so each read service fetches **all** rules once and builds an
in-memory `clientId → ClientRules` map — exactly mirroring how `clientNames` (`clientId → name`) is
already built. This avoids a per-row join and keeps the shared `candidateRepository.list` untouched.

A shared helper builds the pure-rule `ClientRules` (which needs the client `name`) by joining the two
maps once:

```ts
// candidate.service.ts (module-private helper)
function buildRulesMap(
  clients: ClientRow[],
  rulesRows: ClientRulesRow[],
): Map<string, ClientRules> {
  const byClient = new Map(clients.map((c) => [c.id, c.name] as const));
  const out = new Map<string, ClientRules>();
  for (const r of rulesRows) {
    const name = byClient.get(r.clientId);
    if (!name) continue; // orphan rules row (client soft-deleted) — skip
    out.set(r.clientId, {
      name,
      states: r.states, creds: r.creds, pops: r.pops, settings: r.settings,
    });
  }
  return out;
}

/** pct for a row's assigned client, or null when there's nothing to score against. */
function scoreFor(row: CandidateRow, rulesByClient: Map<string, ClientRules>): number | null {
  if (!row.clientId) return null;                      // no client → no fit to report
  const rules = rulesByClient.get(row.clientId);
  if (!rules) return null;                             // client has no rules row
  const { pct, max } = scoreCandidate(toRuleCandidate(row), rules);
  return max > 0 ? pct : null;                         // Future Potential Clients (max 0) → null, not 0%
}
```

`ClientRules.states` etc. are `readonly string[]`; the Prisma row's arrays are `string[]` — assignable.

### 2.2 `toCard` / `toListItem` gain a score argument

Both projectors already take `clientNames`; add the score (computed by the service before the projector,
so the pure DTO shape stays rules-free). Minimal change — pass a precomputed value:

```ts
function toCard(row, viewer, clientNames, now, score: number | null): CandidateCardDTO {
  // ...existing fields...
  score,
}
function toListItem(row, viewer, clientNames, now, score: number | null): CandidateListItemDTO {
  // ...existing fields...
  score,
}
```

### 2.3 The three read services

**`listBoard`** — add rules to the parallel fetch and thread the score in:
```ts
const [rows, clients, rulesRows] = await Promise.all([
  candidateRepository.list(filters),
  clientRepository.list(),
  clientRulesRepository.list(),
]);
const clientNames = new Map(clients.map((c) => [c.id, c.name]));
const rulesByClient = buildRulesMap(clients, rulesRows);
// ...in the loop:
const card = toCard(row, viewer, clientNames, now, scoreFor(row, rulesByClient));
```
`dashboardStats.attention` cards flow through the same `toCard` — thread the rules map there too so
attention cards also carry a score (cheap, one extra small query already loaded via `clients`).

**`listCandidates`** — same three-way `Promise.all`; build `rulesByClient`; map rows to
`toListItem(row, viewer, clientNames, now, scoreFor(row, rulesByClient))`; then **sort by score** (§3.4).

**`getCandidateDetail`** — add `clientRulesRepository.list()` to the existing `Promise.all`, resolve the
one candidate's rules, and attach a `scoring` block:
```ts
const rulesByClient = buildRulesMap(clients, rulesRows);
const rules = candidate.clientId ? (rulesByClient.get(candidate.clientId) ?? null) : null;
const raw = scoreCandidate(toRuleCandidate(candidate), rules);
const scoring = rules && raw.max > 0
  ? { pct: raw.pct, score: raw.score, max: raw.max, flags: raw.flags,
      autoDisqualify: getAutoDisqualify(toRuleCandidate(candidate), rules) }
  : null;
// return { ...existing, scoring };
```

### 2.4 DTO field additions (`lib/validation/*`)

- `CandidateCardDTO` (pipeline.ts): add `score: number | null;` (update the P-5/P-6 doc comment — score
  is no longer deferred).
- `CandidateListItemDTO` (candidate.ts): add `score: number | null;`.
- `CandidateDetailDTO` (candidate.ts): add
  ```ts
  scoring: {
    pct: number;
    score: number;
    max: number;
    flags: string[];
    autoDisqualify: string[];
  } | null;
  ```
  `null` when the candidate has no client / no rules / `max === 0`.

**Null contract (S-3):** every consumer treats `score === null` as "no score to show" → renders "—",
never "0%". `pct === 0` (a real zero — candidate matched nothing but the client *does* constrain
dimensions) is a legitimate low score and DOES render (as `0`, neutral tone).

---

## 3. UI surfacing (S-4, S-5, S-6)

### 3.1 A shared score badge

A small presentational helper (co-located, e.g. `src/components/candidate/score-badge.tsx`) wrapping the
existing `Badge`, so the color scale + hot threshold live in ONE place:

```tsx
const HOT_SCORE = 80; // export from a shared constant (see §3.3)

export function ScoreBadge({ score }: { score: number | null }) {
  if (score === null) return <span className="text-gray">—</span>;
  const tone = score >= 80 ? "success" : score >= 50 ? "amber" : "neutral";
  return <Badge tone={tone}>{score}%</Badge>;
}
```
- **≥ 80 → `success` (green)**, **50–79 → `amber`**, **< 50 → `neutral`** (S-5). Uses only existing
  `BadgeTone` values — no new tokens.

### 3.2 Where it renders

- **Board card** (`wave-2.1` card component): a `ScoreBadge` in the card's chip row, next to
  credential/license. When `pct ≥ HOT_SCORE`, also render a **"Hot" chip** (`Badge tone="success"` text
  `Hot`). Keep the optimistic-move behavior untouched — score is read-only display data on the card;
  it does not change on a move (a move doesn't change the client), so `useOptimistic` state carries it
  along unchanged.
- **List row** (`candidates/page.tsx`): a new **"Score"** column (append to the `columns` array), each
  cell a `ScoreBadge`. Because the list is now score-sorted (§3.4), the highest-fit candidates surface
  at the top.
- **Detail header** (`detail-header.tsx`): a `ScoreBadge` in the chip row (after license-state) plus,
  when hot, the "Hot" chip. Below the header (or in the license/summary area) render the **flags
  breakdown** (§3.3).

### 3.3 Detail flags + auto-DQ breakdown

The detail `scoring` block explains *why* the score isn't 100:
- **Flags list** — render `scoring.flags` (e.g. "Wrong state for Sterling Institute", "License expired")
  as a small bulleted list under the score, muted tone. Empty flags + `pct === 100` → show nothing / a
  "Full match" note.
- **Auto-DQ warning (S-7)** — when `scoring.autoDisqualify.length > 0`, render a **danger-tone banner**
  ("Would be auto-disqualified for {client}: …") listing each reason. This is **advisory only** — it does
  NOT move the candidate to a terminal status (that stays a human action via the stage-mover).
- Show `priority` (from the rules row) as a small client-context chip if desired (optional, low priority).

`HOT_SCORE = 80` should be a single exported constant (e.g. in `src/lib/constants/candidate.ts` or a
`scoring` constant file) imported by both the `ScoreBadge` helper and any card/detail hot-chip logic — do
not hardcode `80` in three components.

### 3.4 List sort (S-6)

Sort in `listCandidates` **after** projecting to list items (score is a computed field, not a DB column,
so it can't be a Prisma `orderBy`):
```ts
candidates.sort((a, b) => {
  if (a.score === b.score) return 0;          // preserves createdAt-desc order from the query (stable sort)
  if (a.score === null) return 1;              // nulls last
  if (b.score === null) return -1;
  return b.score - a.score;                    // highest fit first
});
```
`Array.prototype.sort` is stable (Node ≥ 12), so equal scores retain the repository's `createdAt desc`
tiebreak. The **board is NOT re-sorted** — columns keep their stage grouping and the query's default
ordering (see OQ-2). The list cap (`LIST_CAP = 100`) still applies at the query level; sort happens on the
(≤100) loaded rows, so the "top scores" are top-of-the-loaded-page, not a global top-N (documented
limitation — a true global score sort would need score as a persisted/queryable column, out of scope).

---

## 4. Tests

Pure `scoreCandidate` / `getAutoDisqualify` are **already covered** (`scoring.test.ts`,
`disqualify.test.ts`) — do not duplicate. New tests target the **wiring**:

**Service (`candidate.board.test.ts` / `candidate.list.test.ts` / `candidate.service.test.ts`):**
- **Board** — with a mocked `clientRulesRepository.list()` returning rules for client A, a candidate
  assigned to A with a full match → card `score` is the expected `pct`; a candidate with a mismatch →
  lower `pct`.
- **Null when no client** — candidate with `clientId: null` → `score === null` on card and list item.
- **Null when client has no rules row** — candidate assigned to a client absent from the rules map →
  `score === null`.
- **`max === 0` → null** — candidate on *Future Potential Clients* (empty rules) → `score === null`
  (NOT `0`).
- **List sort** — a set with mixed scores + a null → returned order is score-desc with the null last;
  equal-score rows keep `createdAt`-desc order (stable-sort assertion).
- **Detail** — `getCandidateDetail` returns a `scoring` block with `pct`/`flags` for a client-assigned
  candidate; `scoring === null` for an unassigned one; `autoDisqualify` populated for an expired-license
  candidate.
- **PII invariant preserved** — score wiring does not leak `licenseNumber` onto card/list (existing PII
  assertions still pass).

**Seed (`scripts/seed-rules.ts`):** a light idempotency test (or a documented manual check) — running
twice upserts by `clientId` with no duplicate rows; skips gracefully when a client is missing. If there's
an existing seed-test pattern, follow it; otherwise this is covered by the service tests + a manual
`db:seed:rules` run.

**DTO/type tests:** the isomorphic DTO types compile with the new `score` / `scoring` fields (typecheck).

Rule for mocking: tests mock the **repositories** (`clientRulesRepository`, `clientRepository`,
`candidateRepository`), never Prisma — consistent with the existing service tests.

---

## 5. Open questions / assumptions

- **OQ-1 (hot threshold).** Assumed **`pct ≥ 80` = Hot** (S-5), matching the legacy hot-candidate feel and
  the green band. Owner/Director may want a different cutoff (e.g. 85) — trivially tunable via the single
  `HOT_SCORE` constant. **Confirm the number.**
- **OQ-2 (sort scope).** Recommended: **sort the flat `/candidates` list by score; do NOT re-sort board
  columns** (the board's value is stage grouping + drag; re-ranking cards within a column by score is a
  possible follow-up but risks fighting the recruiter's mental order). Confirm the board stays
  stage/created-ordered.
- **OQ-3 (auto-DQ scope).** Recommended: **display-only on detail** (S-7) — a warning banner, never an
  automatic status change. Confirm we do NOT want auto-DQ to auto-move candidates to a terminal state in
  this slice (that would be a pipeline-automation feature with audit implications).
- **OQ-4 (global vs page-local sort).** With the `LIST_CAP = 100` query cap, score-sort ranks only the
  loaded page, not a global top-N. Assumed acceptable for now; a global score sort would require
  persisting score as a queryable column (recompute on candidate/client-rules change) — **out of scope**,
  flag if product needs true global ranking.
- **OQ-5 (rules editing).** Assumed **deferred to the CRM/client wave** (S-8) — seed-only here. Confirm no
  rules-editing UI/route is expected in this slice.
- **Assumption (rule inputs unchanged).** `scoreCandidate` reads only `licenseState`/`credential`/
  `population`/`setting`/`licenseStatus`; `toRuleCandidate` already supplies all of them. `priority` and
  `autoDisqualify` are stored for display / DQ context and are NOT consumed by `scoreCandidate` — no
  change to the pure rule is proposed (DECISIONS: rules are the argument, not the code).
- **Assumption (seed name match).** `BASE_CLIENT_RULES` is keyed by client `name` (== `legacyId` for all
  `BASE_CLIENTS`); all `creds`/`pops`/`settings` tokens were verified against the `CREDENTIALS` /
  `POPULATIONS` / `SETTINGS` constants — no unknown values.
