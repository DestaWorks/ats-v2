# Wave 1.3 — Bulk Import / Candidate ETL (Module 20) Design

**Status:** design (architect). Backend + frontend implement the service / routes / wizard / tests from
this spec. **Design only — no implementation, no migration, no commit in this wave's doc.** Conforms to
`DECISIONS.md` (wins on conflict), `DATA-MODEL.md`, `IMPLEMENTATION-PLAN.md` §1.3 (+ §1.4 parity),
`MODULE-BREAKDOWN.md` (Module 20), and **builds directly on** the shipped Wave 1.1 candidate schema
(`docs/design/wave-1.1-candidate-schema.md`) and Wave 1.2 documents table
(`docs/design/wave-1.2-parse-resume.md`).

**Feature:** a one-shot Sheet→Postgres importer for the historical candidates. Upload a CSV/JSON export
of the legacy candidate Sheet → **prepare/preview** (parse + transform + dedupe + a diffable report,
**zero writes**) → **commit** (idempotent upsert keyed on `legacy_id`). **Re-running the import never
duplicates.** The user provides the real export at run time; this designs against the known legacy 32
columns.

This is the concrete **consumer of the Wave 1.1 field-mapping table** — 1.1 defined the target schema;
1.3 fills it from the legacy rows. Per DECISIONS **D1** (one-shot ETL, no live Sheet adapter) and **D6**
(dry-run on staging first, then production — that dry-run/prod split is Wave **§1.4**, this wave builds the
importer they run).

---

## Headline decisions

| # | Decision |
|---|----------|
| **E-1** | **CSV is the primary input, JSON secondary.** Both go through **`papaparse`** (CSV) / native `JSON.parse` (JSON) into a common `LegacyCandidateRow[]`. Add **`papaparse`** (MIT — permissive, NDA-OK) + `@types/papaparse`. Rationale in §1. |
| **E-2** | **Reuse, don't rebuild.** `fromLegacyStatusLabel` (status), the `lib/constants` vocab + `BASE_CLIENTS`, `candidateRepository.upsertByLegacyId`/`findByLegacyId` (idempotency key), `documentRepository`, `withTransaction`, `writeAudit`, `apiHandler`, `requireCapability("bulkImport")`. The ETL adds a **pure transform** + a thin **orchestration service** — no new data-access primitives except one small `documentRepository.upsertByLegacyId` (§2.4 gap). |
| **E-3** | **Unknown client → FLAG, do NOT auto-create.** Match `Client` free-text against seeded clients (case-insensitive name / `legacyId`); an unknown non-empty name → `clientId = null` + row flagged `unknown-client`. Auto-creating spawns junk client rows and pollutes the FK. (Owner-vetoable allowlist to auto-create — §3.) |
| **E-4** | **Idempotency = `legacy_id` upsert. Email-dupes = surface + flag, never auto-merge.** Two *different* legacy rows sharing an email → both imported (each keyed by its own `legacy_id`, no data lost), the group is reported, and every row in it gets a **`Needs Review` tag**; keep-newest (by `UpdatedAt`) names the *primary*. No row is silently deleted or overwritten (DECISIONS D8). §4. |
| **E-5** | **This ETL does NOT run the fuzzy résumé matcher.** The identity key here is `legacy_id` (+ email for the dupe report). The Wave-1.2 confidence-gated résumé→candidate match is a *different* flow (interactive upload). The §1.3 plan line "résumé→profile match" is clarified as: legacy-keyed bulk import, so `ResumeFileID/URL/Filename` attach **deterministically by `legacy_id`** to their own candidate row — no fuzzy matching, no wrong-person risk. §5. |
| **E-6** | **Unrecognized status → ERROR (row excluded from commit), never guessed.** Status drives `stageOrder`, gates and funnels — guessing a stage is unsafe. Unmapped vocab (credential/population/setting/source/licenseStatus) → `null` + a **note** (non-blocking). §2. |
| **E-7** | **prepare→commit is stateless: the client re-uploads the same file to commit.** No parsed batch is parked server-side (that's a needless PII surface; 1.2 avoided the same). A `sha256` checksum passed prepare→commit lets commit *advise* if the file changed — non-blocking, because `legacy_id` upsert makes re-parse safe. §7. |
| **E-8** | **No new tables.** `legacy_id` (idempotency) + `activity_log` (audit) suffice. Commit writes one summary `activity_log` row (`entity:"import_batch"`) + a per-candidate audit row. An `import_batch` model is explicitly deferred (§8). |

---

## 1. Input parsing (E-1)

**Recommendation: `papaparse` for CSV, native `JSON.parse` for JSON, into one normalized row type.**

Why not a hand-rolled `split(",")`: a Google-Sheet CSV export routinely contains **quoted fields with
embedded commas and newlines** (a `Tags` list, an address, a name with a comma), **BOM** on the first
header, and CRLF line endings. A naive split silently corrupts those rows — unacceptable for a PII
migration. `papaparse` handles quoting/escaping/BOM/delimiter-sniffing, is battle-tested, MIT-licensed
(permissive → NDA-OK, no GPL/LGPL/AGPL), and small.

```ts
// src/server/services/sheet-parse.ts  (server-only)
import Papa from "papaparse";

export interface LegacyCandidateRow { [header: string]: string } // raw string cells

export function parseSheetExport(
  format: "csv" | "json",
  content: string,
): { rows: LegacyCandidateRow[]; parseErrors: string[] } { … }
```

- **CSV:** `Papa.parse(content, { header: true, skipEmptyLines: "greedy", transformHeader: h => h.trim() })`.
  `header:true` yields objects keyed by the 32 legacy headers. BOM is stripped by papaparse.
- **JSON:** accept either an array of objects (already header-keyed) or a `{ headers, rows }` shape; coerce
  to `LegacyCandidateRow[]`. `JSON.parse` errors → a whole-file `parseError`.
- **Header validation (fail-fast):** required headers `ID`, `Name`, `Status` must be present (case-insensitive,
  trimmed). Missing any → the whole file is rejected before any row transform (`AppError("BAD_REQUEST")`).
  Unknown extra headers are ignored with a note. Header lookup is case-insensitive so a slightly re-cased
  export still maps.
- **Size guard:** text only (no base64/ZIP — résumé *bytes* are out of scope, only the URL/ID metadata is
  carried). Cap the POST body at ~10 MB and warn; historical candidates are recruiter-scale (low thousands
  of rows), so this is generous.

---

## 2. Per-column transform (all 32 → target)

Pure module `src/server/services/candidate-import.transform.ts` — `legacyRowToImport(row, rowNumber):
ImportRowPlan` (unit-tested, no I/O). It consumes the **Wave 1.1 mapping table** and produces the Prisma
`upsertByLegacyId` create/update inputs plus flags/errors/action. Helpers:
`parseLegacyDate`, `parseLegacyInt`, `parseLegacyBool`, and a generic
`mapToVocab(value, VOCAB): { value: string | null; unmapped: boolean }` (case-insensitive exact match
against a `lib/constants` union; unmapped non-empty → `null` + a note).

| # | Legacy column | Target field | Transform | Unmapped / edge rule |
|---|---|---|---|---|
| 1 | `ID` | `legacyId` | trim | **empty → ERROR** (no idempotency key → cannot import) |
| 2 | `Name` | `name` | trim | **empty → ERROR** (required PII) |
| 3 | `Credential` | `credential` | `mapToVocab(·, CREDENTIALS)` | unmapped → `null` + note `unmapped-credential` |
| 4 | `LicenseState` | `licenseState` | trim, uppercase 2-letter (validate vs `states`) | unknown → `null` + note |
| 5 | `LicenseNumber` | `licenseNumber` | trim | **SENSITIVE** — never logged; encrypted at rest + DTO-gated (1.1) |
| 6 | `LicenseStatus` | `licenseStatus` | `mapToVocab(·, LICENSE_STATUSES)` | empty/unmapped → `"Not Verified"` (schema default) + note |
| 7 | `LicenseExpiry` | `licenseExpiry` | `parseLegacyDate` → `DateTime?` | unparseable non-empty → `null` + note |
| 8 | `LicenseVerifiedBy` | `licenseVerifiedById` | trim (actor **string**, D-9) | empty → `null` |
| 9 | `LicenseVerifiedAt` | `licenseVerifiedAt` | `parseLegacyDate` | unparseable → `null` + note |
| 10 | `Client` | `clientId` | resolve vs seeded clients (§3) | unknown non-empty → `null` + **flag** `unknown-client` |
| 11 | `Source` | `source` | `mapToVocab(·, SOURCES)` | unmapped → `null` + note |
| 12 | `Status` | `status` + `stageOrder` | `fromLegacyStatusLabel(·)` → code; `stageOrder = statusOrder(code)` | **undefined → ERROR** `unrecognized-status` (E-6; never guessed) |
| 13 | `Email` | `email` | trim, lowercase-normalize for dedupe (store original case) | empty allowed (D-8: not unique) |
| 14 | `Phone` | `phone` | trim | PII |
| 15 | `City` | `city` | trim | |
| 16 | `State` | `state` | trim (residence ≠ license state) | |
| 17 | `Population` | `population` | `mapToVocab(·, POPULATIONS)` | unmapped → `null` + note |
| 18 | `Setting` | `setting` | `mapToVocab(·, SETTINGS)` | unmapped → `null` + note |
| 19 | `TelehealthPref` | *(dropped, D-4)* | `parseLegacyBool` — **true → append `Telehealth Only` to `tags`** | false/empty → no tag |
| 20 | `YearsExp` | `yearsExp` | `parseLegacyInt` | non-numeric → `null` + note |
| 21 | `Employer` | `employer` | trim | mildly PII |
| 22 | `Tags` | `tags` | split (`;`/`,`), trim, `mapToVocab` each vs `TAGS` | unmapped tags dropped + note; merge with the D-4 telehealth tag; dedupe |
| 23 | `AddedBy` | `createdById` | trim (actor **string**, D-9) | empty → `null` |
| 24 | `AddedAt` | `createdAt` | `parseLegacyDate` (Prisma **allows** overriding `@default`) | unparseable → import-time `now()` + note |
| 25 | `UpdatedAt` | *(proxy, see note)* | `parseLegacyDate` → drives `stageEnteredAt` + dedupe keep-newest | `@updatedAt` is auto → cannot be set directly (OQ-4) |
| 26 | `OutreachAttempts` | `outreachAttempts` | `parseLegacyInt` | empty/non-numeric → `0` |
| 27 | `Track` | `track` | `mapToVocab(·, TRACKS)` | empty → `"Clinical"` (default); unknown non-empty → `"Clinical"` + note |
| 28 | `DeletedAt` | `deletedAt` | `parseLegacyDate` — **present → soft-deleted (Trash)** | §6 |
| 29 | `DeletedBy` | `deletedById` | trim (actor string) | |
| 30 | `ResumeFileID` | → `documents.legacyId` | §5 (documents upsert) | empty resume trio → no document row |
| 31 | `ResumeURL` | → `documents.legacyUrl` | §5 | |
| 32 | `ResumeFilename` | → `documents.originalFilename` | §5 | |

**Derived / no-legacy-source fields set by the ETL:**
- `stageOrder = statusOrder(status)` (mirror, from column 12).
- `stageEnteredAt = UpdatedAt` **as a proxy** — legacy has no per-stage timestamp; using `UpdatedAt`
  keeps SLA/overdue timing sane (a candidate updated yesterday isn't wrongly "overdue"). Falls back to
  `createdAt` then `now()`. (Assumption OQ-2 — timing is a proxy, not exact history.)
- `placedAt = UpdatedAt` **iff** `status === "STARTED_DAY1"`, else `null` (mirrors the 1.1 denorm contract).
- **Synthetic `stage_history` anchor (recommended):** one `stageHistory.add({ fromStatus: null,
  toStatus: status, toStageOrder: stageOrder, enteredAt: stageEnteredAt, actorId: createdById ??
  "system-import" })` per imported candidate, so every migrated candidate has a history root consistent
  with the `move` contract. On re-run this is upsert-guarded (§4 idempotency) — do **not** append a
  duplicate anchor. (Vetoable — OQ-3.)

`ImportRowPlan` shape the transform returns:
```ts
interface ImportRowPlan {
  legacyId: string;
  rowNumber: number;
  name: string;
  normalizedEmail: string | null;         // lowercased/trimmed, for dedupe only
  updatedAt: Date | null;                  // keep-newest key
  create: Prisma.CandidateUncheckedCreateInput; // legacyId injected by the repo
  update: Prisma.CandidateUncheckedUpdateInput;  // fields safe to refresh on re-run
  document?: DocumentUpsertPlan;           // §5 (only if resume trio present)
  flags: ImportFlag[];                     // non-blocking, surfaces in report ("unknown-client", "email-duplicate", "unmapped-*")
  errors: ImportError[];                   // blocking → excluded from commit ("unrecognized-status", "missing-id", "missing-name")
  action: "insert" | "update" | "softDelete" | "skip" | "error"; // planned (prepare) / actual (commit)
}
```
The `update` map deliberately **omits** `createdAt`/`createdById` (never rewrite provenance on re-run) and
never overwrites human-edited data with a null (see §4 keep-newest note).

---

## 3. Client resolution (E-3)

Legacy `Client` is a free-text account name. The importer loads `clientRepository.list()` once and builds a
normalized index: `Map<normalized(name|legacyId) → clientId>` where `normalize = trim + lowercase +
collapse-whitespace`. Per row:
- match → `clientId`.
- empty `Client` → `clientId = null` (not flagged — legitimately unassigned).
- **unknown non-empty** → `clientId = null` + **flag `unknown-client`** (row still imports, recruiter
  assigns the client in-app afterward, or the client is seeded and the idempotent import re-run picks it up).

**Why flag, not auto-create:** `BASE_CLIENTS` is a curated, seeded list (Wave 1.1 D-5); the CRM client table
is upgraded *in place* later (plan §5). Auto-creating a `clients` row from every free-text spelling variant
("DOCs Medical Group" vs "Docs Medical") would spawn duplicate/junk accounts and pollute the FK that scoring
keys off. Surfacing unknowns to a human is the safe, reversible choice.

**Vetoable (OQ-1):** if the Owner confirms the Sheet's client names are clean and complete, add an
`autoCreateClients: true` prepare flag → unknown names upsert a `clients` row by name (idempotent via the
client `legacyId`/name key) instead of flagging.

---

## 4. Dedupe + merge algorithm (E-4, DECISIONS D8)

Two distinct concerns, both required:

**(a) Idempotent re-run — `legacy_id` upsert.** Every candidate carries `legacyId @unique` (1.1). Commit
calls `candidateRepository.upsertByLegacyId(legacyId, create, update)`. Re-running the *same* Sheet row
updates the existing candidate (even a soft-deleted one — `findByLegacyId`/`upsert` are intentionally
delete-agnostic) instead of inserting a duplicate. **This alone guarantees "re-run = no dupes."** In the
report a row already present → `action: "update"`; absent → `"insert"`.

**(b) Email-primary dedupe — two *different* legacy rows, same person.** After transforming all rows, group
by `normalizedEmail` (ignoring blank emails). A group with **>1 distinct `legacyId`** is a suspected
same-person collision. Policy — **keep-newest + flag, never auto-merge (D8):**
1. **Import every row** (each keyed by its own `legacy_id`) — no data is lost, nothing is deleted.
2. **Keep-newest names the primary:** the row with the greatest `UpdatedAt` is the *primary*; ties → greatest
   `createdAt` → lexical `legacyId` (deterministic for the parity diff).
3. **Flag the whole group:** every candidate in the group gets a **`Needs Review` tag** appended (via the
   `tags` update, deduped), and the group is listed in `report.emailDuplicateGroups` with `keptLegacyId` =
   the primary. `action` on each stays `insert`/`update` (they *are* written) but each carries flag
   `email-duplicate`.
4. **The "loser" rows are NOT soft-deleted or overwritten** — silently collapsing them would violate D8.
   A recruiter resolves the merge later in-app (a future merge tool / Wave 2.5 purge). Keep-newest only
   decides which row is surfaced as primary and, *if* the Owner later opts into auto-merge, whose field
   values would win.

> Cross-run note: the email index is built over the batch **and** existing DB candidates
> (`candidateRepository.list({ includeDeleted: true })` scoped to the emails in the batch), so a second
> import that introduces a colliding email against an already-migrated candidate is flagged too.

**No silent overwrite on update:** the `update` map only refreshes fields; it must **not** null-out a value
that a human edited post-import. Recommended: on re-run, update writes non-null transformed values only
(empty legacy cell → leave the DB value), consistent with the 1.2 "fill-empty, no destructive overwrite"
posture. (OQ-5 — confirm whether a legacy value should ever overwrite a newer human edit; default: no.)

---

## 5. Résumé handling — deterministic, no fuzzy match (E-5)

The résumé trio maps to a **`documents`** row (Wave 1.2 table) keyed by `ResumeFileID → documents.legacyId`:
```ts
interface DocumentUpsertPlan {
  legacyId: string;            // ResumeFileID  (idempotency key)
  legacyUrl: string | null;    // ResumeURL     (legacy Google Drive pointer, preserved — S-2)
  originalFilename: string;    // ResumeFilename (fallback "resume.pdf")
  type: "resume";
  candidateId: string;         // the just-upserted candidate's cuid — deterministic, by legacy_id
  mimeType: "application/pdf"; // assumed (OQ-6); no bytes/text stored at ETL
}
```
- **No fuzzy matching.** The candidate identity is `legacy_id`; the résumé attaches to *its own* candidate
  row deterministically. The Wave-1.2 `matchResumeToCandidate` confidence flow (email-exact→auto /
  name-fuzzy→confirm / none→new) is the **interactive upload path** and is **not invoked here** — so there
  is zero wrong-person-PII risk from the bulk import. This clarifies/closes the §1.3 plan phrase
  "résumé→profile match confidence threshold" for the bulk-import context.
- **No résumé bytes or LLM extraction at ETL.** Consistent with 1.2 S-2, the ETL stores only metadata +
  `legacyUrl` (the historical Drive link); `storageKey`/`extractedText`/`extractedData` stay null. The
  legacy Module-20 "AI parse + Drive upload on commit" is **intentionally dropped** — extraction is the
  interactive 1.2 flow, not the migration.
- **Gap to fill (E-2):** `documentRepository` today exposes only `create` — for idempotent re-runs the ETL
  needs `documentRepository.upsertByLegacyId(legacyId, data)` (+ `findByLegacyId`), mirroring the candidate
  repo. `Document.legacyId` is already `@unique` (1.2). Add these two small methods in this wave.

---

## 6. Soft-deleted rows → Trash (E-6)

A legacy row with a non-empty `DeletedAt` is imported **soft-deleted**: `deletedAt` + `deletedById` set from
the columns, `action: "softDelete"` in the report. It lands in Trash, not the active pipeline — the
repository's default `deletedAt IS NULL` exclusion keeps it out of every list/board automatically. The
candidate is still fully upserted (name, status, stageOrder, etc.) so restore works and re-run stays
idempotent (`upsertByLegacyId` is delete-agnostic). Its résumé document (if any) is created but likewise
filtered by the documents soft-delete default when listed through the candidate.

---

## 7. Report shape + prepare/commit hand-off

### 7.1 Report (diffable for §1.4 parity)

```ts
interface ImportReport {
  counts: {
    total: number;
    added: number;      // action "insert"
    updated: number;    // action "update"
    softDeleted: number;// action "softDelete"
    skipped: number;    // action "skip" (e.g. duplicate legacy_id within the same file)
    flagged: number;    // rows with ≥1 non-blocking flag
    errored: number;    // action "error" (excluded from commit)
  };
  emailDuplicateGroups: { email: string; legacyIds: string[]; keptLegacyId: string }[];
  rows: ImportRowResult[];   // FULL, deterministically ordered by legacyId — the diff surface
  flagged: ImportRowResult[]; // convenience projection
  errored: ImportRowResult[]; // convenience projection
  fileChecksum: string;       // sha256 of the parsed content (E-7 hand-off)
}
interface ImportRowResult {
  legacyId: string; rowNumber: number; name: string;
  action: "insert" | "update" | "softDelete" | "skip" | "error";
  flags: string[];   // "unknown-client", "email-duplicate", "unmapped-credential", ...
  errors: string[];  // "unrecognized-status", "missing-id", "missing-name"
}
```
**prepare** returns the report with `action` = what commit *would* do (nothing written). **commit** returns
the *same shape* with `action` = what it *did* — so §1.4 can diff `staging` vs `prod` vs the Sheet counts and
spot-check any row. `rows` is sorted by `legacyId` for a stable diff. Emails/PII are **not** put in the
report beyond name (already displayed in-app); `emailDuplicateGroups` lists emails because that group is the
actionable review item — but the report is only ever returned to a `bulkImport`-capable viewer.

### 7.2 Routes

Both under `src/app/api/migration/`, wrapped in `apiHandler`, guarded by
**`requireCapability("bulkImport")`** (a leadership capability — `roles.ts`; Owner/Director/Manager/Admin),
zod-validated body, standard `{ error: { code, message } }` envelope.

```
POST /api/migration/prepare   // parse + transform + dedupe, ZERO writes → ImportReport
POST /api/migration/commit    // idempotent upsert (chunked txns) → ImportReport (actual)
```

**Body (both), zod in `src/lib/validation/migration.ts`:**
```ts
const importInputSchema = z.object({
  format: z.enum(["csv", "json"]),
  filename: z.string().min(1),
  content: z.string().min(1).max(10_000_000),   // raw CSV/JSON text (client reads the file)
  checksum: z.string().length(64).optional(),   // sha256 the client computed; commit echoes prepare's
});
```

**Hand-off (E-7): stateless re-upload.** prepare returns `report.fileChecksum`; the wizard keeps the file in
memory and sends the same `content` to commit, echoing `checksum`. Commit recomputes the checksum; a
mismatch → a **non-blocking** warning appended to the report (`legacy_id` upsert makes re-parse safe, so a
changed file is not a hard error — it just means the preview the human approved differs). **Rejected
alternative:** a server-side batch token / `import_batch` staging row — it parks a full copy of candidate
PII between two requests for no idempotency benefit, exactly the surface 1.2 avoided.

**Commit transaction strategy:** **chunked, continue-on-error** (like `bulk-move`'s partial-success model),
NOT one giant transaction. Each candidate = one `withTransaction`: `candidateRepository.upsertByLegacyId`
→ (optional) `documentRepository.upsertByLegacyId` → (optional) synthetic `stageHistory` anchor →
`writeAudit(tx, { entity:"candidate", action:"import", after })`. Errored rows are skipped and reported;
successful rows commit independently (a single bad row can't abort thousands). After the loop, one summary
`writeAudit({ entity:"import_batch", entityId: checksum, action:"commit", after: counts })`. A single
multi-thousand-row transaction risks Supabase pooler timeouts and an all-or-nothing failure mode; idempotency
means a partial commit is simply re-runnable.

### 7.3 Service shape

`src/server/services/migration.service.ts` (`import "server-only"`):
```ts
migrationService.prepare(input, user): Promise<ImportReport>  // parse → transform → dedupe → report (no writes)
migrationService.commit(input, user):  Promise<ImportReport>  // prepare(pure) → chunked upsert → actual report
```
`commit` internally re-runs the pure transform+dedupe (same code path as `prepare`) then executes the writes
— the pure pipeline (`sheet-parse` + `candidate-import.transform` + a `dedupeByEmail` pass) is shared and
unit-tested independently of the DB.

---

## 8. New tables? (E-8) — none

`legacy_id` (idempotency) + `activity_log` (per-candidate `import` audit + one `import_batch` summary row)
**suffice**. An `import_batch` model (history of every run, per-run row status) is **deferred** — it adds a
migration + a UI for marginal value while `activity_log` already records who imported what and when, and the
report is returned live to the operator. Revisit only if the Owner wants a persisted, browsable import
history. (Recorded as OQ-7.)

---

## 9. Wizard UI (3 steps, 1:1 with legacy Module 20 intent)

`src/app/(app)/migration/` (client component tree). Reuses the shared primitives
(`Button`, `Badge`, `Card`, `Field`, `EmptyState`, `ErrorState`, `Spinner`, `Skeleton`) + Tailwind tokens —
no inline-style port. **One new primitive:** a minimal accessible `Table` (`<table>` with `scope`ed headers)
for the row report; recommend adding it to `components/ui` (reused by later reports/CRM).

- **Step 1 — Upload.** Drag-drop / keyboard-accessible file input (`.csv`, `.json`); a format toggle
  (auto-detected from extension, overridable). On select: read the file to text in-browser, compute the
  `sha256` (`crypto.subtle.digest`), POST to `/api/migration/prepare`. `Spinner` while parsing.
- **Step 2 — Preview report.** Summary **stat cards** (`Card` + `Badge`: added / updated / softDeleted /
  skipped / **flagged** / **errored**). A **flagged** table and an **errored** table (`Table`) with per-row
  `legacyId`, name, action, and reason chips; the `emailDuplicateGroups` panel lists each collision group
  with its `keptLegacyId`. `EmptyState` when a bucket is empty; `ErrorState` (with retry) on a prepare
  failure. The **Commit** button is disabled while `errored` rows exist above a threshold **only as a
  warning** — commit is still allowed (errored rows are simply skipped); a confirmation dialog (`Dialog`)
  restates "N will import, M skipped (errors), K flagged for review" before writing.
- **Step 3 — Commit + result.** POST `/api/migration/commit` (same file + checksum). Show the **actual**
  report next to the preview (a small planned-vs-actual diff), success `Badge`s, and a "re-run is safe"
  note. `role="status"` announces completion.
- **a11y:** file drop-zone wraps a real keyboard-focusable `<input type="file">`; report tables use
  `<th scope="col">`; stat cards are not the only signal (text labels, not color-only badges); the
  prepare/commit progress and completion are announced via `role="status"`; the commit confirmation is a
  focus-trapped `Dialog` (Radix) with a labeled destructive-style confirm.

**Behavior deltas from legacy (fixed, not ported):** the legacy inspect-modal "include" checkbox that
always reduced to `true`, and legacy's silent-drop of résumé-less rows, are both corrected — here every row's
disposition is explicit in the report, and résumé-less rows import normally (résumé is optional metadata).

---

## 10. Tests (mandatory — migration golden-files per DECISIONS)

Pure transform + dedupe are the core; the DB/route layer is mocked.

**`candidate-import.transform` (pure, golden fixtures):**
- every column → correct target; `Status` via `fromLegacyStatusLabel`; `stageOrder` mirrors.
- `TelehealthPref` true → `Telehealth Only` tag appended (D-4); false/empty → no tag.
- `DeletedAt` present → `action: "softDelete"` + `deletedAt`/`deletedById` set (imports to **Trash**).
- **unrecognized `Status` → `error` (`unrecognized-status`), excluded from commit — not guessed** (E-6).
- unmapped credential/population/setting/source/licenseStatus → `null` + a note (not an error).
- missing `ID` / missing `Name` → `error`.
- résumé trio present → a `DocumentUpsertPlan` keyed by `ResumeFileID` with `legacyUrl` preserved; absent → none.
- date/int/bool parse helpers incl. unparseable → null + note.

**`dedupeByEmail` (pure):**
- two rows, **different `legacy_id`, same email** → both kept, group reported, `keptLegacyId` = greatest
  `UpdatedAt` (keep-newest), every group row flagged `email-duplicate` + gets `Needs Review` tag —
  **no row deleted/merged** (D8, E-4).
- same `legacy_id` twice in one file → second is `skip` (not a false email-dupe).
- blank emails never group.

**`client resolution` (pure/service):** exact/case-insensitive match → `clientId`; empty → null unflagged;
unknown non-empty → null + `unknown-client` flag (no auto-create, E-3).

**Service / route (mock repos):**
- **idempotency:** commit the same batch twice → second run yields all `action: "update"`, **zero new
  candidate rows** (`upsertByLegacyId` asserted, `create` never double-called) — the headline "re-run = no
  dupes" test.
- `ResumeURL/FileID` present → a `documents` row upserted by `legacyId` (idempotent on re-run).
- prepare writes **nothing** (assert no repo mutation called); commit writes + audits per row + one
  `import_batch` summary audit.
- **authZ:** unauthenticated → 401; a non-`bulkImport` role → 403 (both prepare and commit).
- oversized / malformed CSV / JSON.parse failure / missing required header → 422/`BAD_REQUEST`.
- checksum mismatch between prepare and commit → non-blocking warning in the report (still commits).
- **no PII in logs:** assert the logger is never called with `licenseNumber`/email/name during a run.

---

## 11. Open questions / assumptions (flag, don't guess)

- **OQ-0 (BLOCKING — the actual export format):** *What exactly does the user's Sheet export look like?*
  Confirm: (a) CSV vs JSON vs an Apps-Script custom export; (b) the header row matches the 32 names verbatim
  (or a re-cased/renamed variant); (c) the **date format** in `LicenseExpiry`/`AddedAt`/`UpdatedAt`/
  `LicenseVerifiedAt` (ISO-8601? `M/D/YYYY`? a locale string?) — `parseLegacyDate` must be written against the
  real format, not guessed; (d) the `Tags` delimiter (`;`, `,`, JSON array?); (e) `TelehealthPref`
  encoding (`TRUE`/`true`/`1`/`✓`). *We design the pipeline now; this pins the parsers before the real run.*
- **OQ-1 (client auto-create):** default is **flag** unknown clients (E-3). Veto → `autoCreateClients` flag.
- **OQ-2 (stage timing proxy):** `stageEnteredAt`/`placedAt` are proxied from `UpdatedAt` (legacy has no
  per-stage timestamp). Accept the proxy, or leave them null and treat all migrated candidates as "just
  entered"? Default: proxy from `UpdatedAt`.
- **OQ-3 (synthetic stage_history anchor):** create one root history entry per migrated candidate (default:
  yes), or leave history empty until the first new `move`?
- **OQ-4 (`updatedAt`):** `Candidate.updatedAt` is Prisma `@updatedAt` (auto) — the ETL **cannot** set it,
  so the DB `updatedAt` becomes import-time. The legacy `UpdatedAt` is preserved *functionally* via
  `stageEnteredAt` + the dedupe key. Confirm that's acceptable, or add a raw `legacyUpdatedAt` column to
  retain the exact value.
- **OQ-5 (re-run overwrite policy):** on re-import, should a legacy value ever overwrite a newer human edit?
  Default: **no** — update refreshes non-null fields but is not destructive; align with the 1.2 fill-empty
  posture. Confirm.
- **OQ-6 (résumé mime/type):** ETL assumes `application/pdf` for the résumé document (bytes/text not stored,
  1.2 S-2). Confirm legacy résumés are all PDFs, or store `mimeType` null.
- **OQ-7 (`import_batch` table):** deferred (E-8) — `activity_log` covers audit. Confirm no persisted,
  browsable import-history UI is required for v1.
- **Backend assumption (legacy):** the 32-column shape + `"N - Label"` status encoding are treated as ground
  truth (from the live Apps Script, per the task brief). The one-shot `Code.gs` migration export behavior
  itself is not re-verified — we consume the export file, not the Sheet live (D1).
```
