# Migration Gap Analysis — legacy Sheet → Postgres

**Updated 2026-08-25** against the real export (`Healthcare 101 Results.xlsx` + an `ATS_Candidates`
CSV). Supersedes the 2026-08-24 revision, which was written from `legacy/Code.gs` alone and assumed
29 tabs of unknown size. Read-only analysis — nothing has been migrated.

Purpose: one decision per tab — **migrate / derive / drop** — plus the list of things that must be
**restructured before** an import is attempted, so nothing is lost silently.

---

## 1. What the workbook actually is

The export has **20 tabs**. `Code.gs` references **29**. They overlap on 18.

- **11 tabs `Code.gs` expects do not exist**: `ATS_Deals`, `ATS_ICPs`, `ATS_RoleNotes`,
  `ATS_ClientContacts`, `Client_Match_Profiles`, `Client_Verification_Presets`, `Daily_Briefs`,
  `Weekly_Briefs`, `Blocked`, `OP_Credentials`, `OP_Enrollments`. Those legacy features were built
  but never used. **This removes most of the CRM migration scope.**
- **2 tabs exist that `Code.gs` never touches**: `Sheet1` and **`ATS_ClientSignals`**.
- The workbook is the **"Healthcare 101" quiz sheet with the ATS bolted on** — `Sheet1` (empty) and
  `Events` (400 rows) are quiz results, unrelated to recruiting.

`ATS_ClientSignals` (59 rows × 27 cols) is undocumented scope: `CompanyName`, `RoleTitleRaw`,
`SalaryMin/Max`, `PostURL`, `DedupeHash`, `SignalScore`, `MatchedCandidateIDs`. No Postgres target,
no design doc, no importer. **Needs a decision.**

---

## 2. Volume — an order of magnitude smaller than assumed

| Tab | Rows | → Postgres | ETL |
|---|---:|---|---|
| **Sourced_Leads** | **828** | `SourceLead` | ⬜ |
| Events *(quiz)* | 400 | — | ➖ |
| ATS_Activity | 383 | `ActivityLog` | ⬜ |
| ATS_OverviewBriefs | 76 | `DailyBrief` | ⬜ |
| **ATS_ClientSignals** | **59** | *none* | ⬜ |
| **ATS_Candidates** | **29** | `Candidate` + `Document` | ✅ |
| AccessRequests | 14 | `AccessRequest` | ⬜ |
| ATS_Notes | 13 | `CandidateNote` | ⬜ |
| Migration_Queue | 12 | — | ➖ |
| Invites | 12 | — | ➖ |
| ATS_Mentions | 8 | `Mention` | ⬜ |
| ATS_DailyTargets | 7 | `DailyTarget` | ⬜ |
| Open_Roles | 7 | `OpenRole` | ⬜ |
| ATS_Prospects | 6 | `Prospect` | ⬜ |
| ATS_ParkedActions | 4 | *none* | ⬜ |
| ATS_Profiles | 3 | `User` | ⬜ |
| OP_Providers | 3 | — *(desta-operate)* | ➖ |
| Settings | 2 | — | ➖ |
| ATS_DailyActuals | 0 | `DailyActual` | ➖ |
| Sheet1 | 0 | — | ➖ |

≈**1,450 business records** excluding the quiz rows.

**Consequence:** the known "commit cannot finish in one 300s invocation" defect is real but
**irrelevant at this size**. The risk in this migration is **identity and mapping**, not throughput.
Correspondingly, 29 candidates is small enough to verify by eye; the 828 leads are the only table
where automation genuinely earns its keep.

---

## 3. Must be restructured before import

### 3.1 The `ATS_Candidates` header row is malformed — BLOCKING

33 columns, with positions 25 and 26 **blank**. Both hold real data:

| idx | Real field | Populated | Shape |
|---:|---|---:|---|
| 25 | **`OutreachAttempts`** | 13 | JSON array — `{by, channel, template, sent_at, response, response_at}` |
| 26 | **a second Track column** | 10 | `Clinical` / `Operations` / `Prescriber` |
| 27 | `Track` *(labelled)* | 15 | same vocabulary |

So the tab carries **two Track columns**. Two rows populate both, and **one of those two disagrees**.
Reading only the labelled column gives 15 candidates a track; merging both gives 23; the rest fall
back to `Clinical`. Track selects which stage gates apply (Clinical needs credential + license,
Operations does not), so eight candidates would be silently gated on credentials they do not need.

The importer maps by header **name**, so as it stands `OutreachAttempts` and the second Track column
are both dropped. **Fix in the sheet before exporting** — label column 25, resolve the two Track
columns into one, and settle the conflicting row.

### 3.2 One client, four spellings — BLOCKING

There is no `Clients` tab; a client is a free-text string. Across two tabs:

| Spelling | Tab |
|---|---|
| `DOCs Medical Group` | ATS_Candidates |
| `Docs Medical Group` | ATS_Candidates |
| `DOCS Medical Group` | Sourced_Leads |
| `Docs` | Sourced_Leads |

There are **4 real clients**: DOCS Medical Group, Sterling Institute, Contemporary Care,
Ritu Suri & Associates. They must be normalised into a human-approved canonical list and seeded
into `clients` **before any other importer runs**, or candidates and leads split across duplicate
client rows.

### 3.3 Vocabulary drift — one case is real data loss

| Field | Values found | Consequence |
|---|---|---|
| **`Tags`** | `Promoted from Sourcing`, `NPPES`, **`IndrasurID:19/40/44`** | Every sampled tag is unmapped, and the ETL **drops** unmapped tags. `IndrasurID:NN` is a **foreign key to the Indrasur system** — it would be destroyed. Needs a real column or an explicit decision. |
| `Credential` | `Child psychiatrist`, `LPCC-S` unmapped; **`"PMHNP-BC , FNP"`** | The last is **two credentials in one cell**; the schema has a single `credential` field. Needs a primary-plus-secondary rule. |
| `Source` | `Migrated · Indeed`, `Migrated from Indrasur`, `Migrated · Referral`, `Migrated · Direct Application` | Encodes **provenance**, not source. Should split into `source` + a migration marker. |
| `LicenseStatus` | `N/A — Operations` | Not in vocab → degrades to `Not Verified`. Harmless (Operations is exempt from license gates) but semantically wrong. |

### 3.4 `ATS_ParkedActions` has no header row

Row 1 is data (4 data rows total). Any header-driven read loses that row and mislabels every column.
Note the target feature (park/snooze) is **still deferred** — there is no table to import into.

### 3.5 `Sourced_Leads` identity — the one laborious reconciliation

- 828 rows; **682 emails present, 593 distinct → 89 duplicates**
- **146 rows have no email at all**, where email-primary dedupe cannot decide
- `Status` only ever `Sourced` or `Promoted` (the app models a fuller lifecycle — fine, it maps)
- `PromotedTo` populated on 13 rows — these must reconcile against the 29 candidates

### 3.6 Column drift vs `Code.gs`

| Tab | Export | Declared | Missing |
|---|---:|---:|---|
| `Sourced_Leads` | 18 | 21 | `DeletedAt`, `DeletedBy`, `SnoozedUntil` |
| `ATS_DailyActuals` | 11 | 13 | `PerClientSourcing`, `ShiftHandoff` |
| `Invites` | 4 | 5 | `Password` — **good**, the plaintext-password risk is absent from this export |

### 3.7 Target-schema gaps — fields with nowhere to land

These are not mapping problems; the destination column does not exist. Each needs a schema
migration or an explicit decision to discard.

| Gap | Scope | Severity |
|---|---:|---|
| **`SourceLead` has no `city`** — only `state` | **824 cells** | High — needs a column |
| **`ATS_OverviewBriefs` is structurally incompatible** (below) | **76 rows** | High |
| **`Mention.noteId` is NOT NULL, source has no `NoteID`** | 8 rows | Blocking for that tab |
| `ActivityLog` has no home for `Details` free text | 377 cells | Medium |
| `Prospect` has no street `Address` field | 6 cells | Low |
| `ActivityLog` has no `CandidateName` (denormalized, redundant) | 383 cells | Low |

**The briefs mismatch.** `ATS_OverviewBriefs` holds **per-user** daily briefs — 76 rows across
**10 distinct users** over 40 dates. `DailyBrief.date` is `@unique` **globally**, modelling one
team-wide brief per day. Twenty dates carry more than one brief, so **56 of the 76 rows would
violate the constraint**. This is a different entity, not a rename. Either add `userId` and change
the constraint to `@@unique([userId, date])`, or decide briefs are regenerable and drop them.

**The lead outreach log.** `Sourced_Leads.OutreachAttempts` is also a JSON array, not a count — and
it is the largest hidden dataset in the workbook: **906 outreach entries across 644 leads**, three
actors, all LinkedIn. `SourceLead` has both `outreachCount` and an `outreachAttempts` relation, so
the target exists and the blob must be split into `OutreachAttempt` rows. One catch: **905 of the
906 have a blank `sent_at`**, while `OutreachAttempt.at` is NOT NULL. The real date survives only as
prose in the response field (`"Email sent on 5/14"`). Timing must be proxied from the lead's
`SourcedAt`, keeping the raw text in `note` so nothing is destroyed.

**Actor identity is wider than `ATS_Profiles`.** That tab has 3 rows, but the briefs tab alone
carries **10 distinct user emails**. The actor map needs a fallback for historical actors with no
profile row — it is not a 3-entry lookup.

---

---

## 4. Files / resumes — the ETL moves no bytes

**12 of 29 candidates have a resume, and all of them live in Google Drive.** The export carries only
pointers: `ResumeURL` is `https://drive.google.com/file/d/<FILE_ID>/preview`, and `ResumeFileID` is a
33-char Drive file id. Formats are **7 `.pdf`, 4 `.docx`, 1 `.doc`**.

This is by design, not an oversight. `wave-1.3-etl.md` §5 states that no resume bytes and no LLM
extraction happen at ETL, leaving `storageKey`/`extractedText`/`extractedData` null, and `schema.prisma` comments
`Document.storageKey` as *"NULL until Wave 6"*. Each resume becomes a `Document` row with
`legacyId` = Drive file id, `legacyUrl` = the Drive link, `storageKey` = **null**.

Behaviour in the running app after such an import:

- `resume.service.ts:232` — `getDownloadUrl` **throws `NOT_FOUND`**, because it requires `storageKey`
- `resume-tab.tsx:44` — the UI **falls back to `legacyUrl`** and opens Drive in a new tab

So the files stay reachable, but **not through the app**. Four reasons that is not acceptable for
production:

1. **Access control leaves the system.** `viewCredentials` does not govern a Google Drive link. A
   recruiter without Drive permission cannot open it; anyone *with* the link and Drive access can,
   regardless of ATS role. The DTO gating becomes decorative for the actual file.
2. **PII governance breaks.** Resumes are the densest PII held (NPI, DEA, license numbers, address,
   employment history). In Drive they sit outside field encryption, the audit log, and retention or
   erasure. Purge does not touch Drive, so deleting a candidate leaves the resume intact and
   unreferenced — a worse version of the known "purge leaves the storage object" gap.
3. **Wave 6 retires the Sheet and Apps Script.** If the Drive folder goes with them, all 12 files
   die; if it stays, it is exactly the external dependency this migration exists to remove.
4. **The upload path rejects 5 of the 12.** `src/lib/validation/resume.ts:179` is
   `z.enum(["application/pdf", "text/plain"])`. This answers **OQ-6**: the resumes are *not* all
   PDFs, and the signed-upload route cannot currently accept a Word document.

**Storage itself is ready.** Verified 2026-08-25: the `avatars` and `resumes` buckets both exist and
`S3_*` credentials are set on Preview and Production. Earlier notes describing object storage as
"dormant, no environment has S3 credentials" are out of date.

### Recommended: a one-time file pass (12 files)

Run alongside the candidate import:

1. Download each Drive file by `ResumeFileID`.
2. Upload to the **private `resumes` bucket** under a server-minted key.
3. Set `Document.storageKey`; **keep `legacyUrl`** as provenance rather than overwriting it.
4. Widen the MIME allowlist to `.docx`/`.doc`, or convert to PDF on the way in — decide which.

Then `getDownloadUrl` works, the capability gate governs the file, and purge can reach it.

**Ordering caveat:** `src/server/integrations/storage.ts` still has **no delete function**. Putting
real resumes in the bucket before adding one turns the known orphan-on-purge gap from hypothetical
into actual. Add `deleteObject` in the same pass.

---

## 5. What the export settled

- **All 7 `Status` labels map correctly** via `fromLegacyStatusLabel` — no blocking status errors.
- **Every date is ISO-8601 UTC** (`2026-06-19T13:00:43.522Z`). OQ-0's largest unknown is closed:
  `parseLegacyDate` needs no locale handling.
- No blank `ID` or `Name` in either table; candidate emails are 14/14 distinct.
- `LicenseExpiry`, `DeletedAt` and `TelehealthPref` are **entirely empty** — no trash rows to
  migrate, and the D-4 telehealth-tag rule never fires.
- `ATS_Profiles` has **3 rows**, so building the actor name→id map is three entries, not a project.
- 12 of 29 candidates carry the resume trio → 12 `Document` rows.

Still open from `wave-1.3-etl.md` §11: OQ-1 (client auto-create), OQ-2/OQ-3 (stage timing proxy and
the synthetic history anchor), OQ-5 (re-run overwrite policy), OQ-6 (resume MIME).

---

## 6. Known defects in the one built ETL

1. **No `stage_history` row is written.** OQ-3 specified a synthetic anchor ("default: yes"); it was
   never implemented. Consequence: `activeOrderAsOf` returns 0 for every imported candidate, so the
   Pipeline Funnel reports 100% in stage 0 at 0% conversion until each row is moved by hand.
2. **Actor strings are unmapped.** D-9 permits non-user strings in actor columns, but `mine`/owner
   filters compare against `User.id`. With `ATS_Profiles` at 3 rows this is now a trivial fix.
3. **Serial per-row transactions under `maxDuration = 300`.** Real, but moot at 1,450 rows.

---

## 6b. Fidelity — how much survives

Measured cell-by-cell on the two tables that matter (12,628 of roughly 13,000 populated cells).

| Table | Populated cells | Lost if imported as-is | Fidelity |
|---|---:|---:|---:|
| ATS_Candidates | 494 | 51 | 89.7% |
| Sourced_Leads | 12,134 | 1,652 | 86.4% |
| **Combined** | **12,628** | **1,703** | **86.5%** |

Row-level, of the 1,360 rows in scope: **29 have a working importer today (2.1%)**; 1,331 do not.

| Scenario | Data migrated intact |
|---|---:|
| Import as-is today | **~2%** |
| After all importers + the `city` column + the outreach splitter | **~100%** |

Every one of those 1,703 cells is recoverable. **Unavoidable residual even at "100%":** `sent_at`
timing on 905 outreach entries (proxied, raw text preserved); the exact legacy `UpdatedAt` (OQ-4);
and lead soft-delete state, whose columns are absent from the export entirely.

---

## 7. Open questions for Biruh

1. **Is this the complete production workbook?** 29 candidates is small for a system described as
   live with real users, and 11 expected tabs are absent. Confirm there is no second workbook
   before we treat this as the full picture. *(Highest priority — everything below assumes the answer.)*
2. **`ATS_ClientSignals`** (59 rows) — migrate, or drop? It has no target table and no design.
3. **`Events` + `Sheet1`** (400 quiz rows) — drop?
4. **`IndrasurID:NN` tags** — does the Indrasur linkage need to survive migration?
5. **`"PMHNP-BC , FNP"`** — which is primary?
6. **Word-format resumes** (5 of 12) — store as-is, or convert to PDF during the file pass?
7. Confirm `OP_Providers` is out of scope (belongs to desta-operate).
8. Confirm `Invites`, `AccessRequests`, `Migration_Queue`, `Settings` are droppable.
9. **`ATS_OverviewBriefs`** (76 rows) — add `userId` and re-key the unique constraint, or drop as
   regenerable? *(`ATS_ClientSignals` is parked by decision 2026-08-25.)*

---

## 8. Recommended order

Forced by foreign keys — do not reorder. Every step runs **plan (zero writes) → apply**, first
against the local scratch database (`.env.scratch`, Postgres 16, schema applied from zero) and
only then against the real one:

1. **Fix the sheet** — the `ATS_Candidates` header row (§3.1), then re-export.
2. **Derive + approve the 4 clients** (§3.2), seed `clients`.
3. **`ATS_Profiles` → `User`** (3 rows) and build the actor name→id map.
4. **Candidates** (29) — existing ETL plus the `stage_history` anchor and actor mapping.
5. **Resume files** (12) — Drive → private `resumes` bucket, set `storageKey` (§4).
6. **Leads** (828) — needs a new importer; budget the time here, incl. the 89 email collisions.
7. **Notes → mentions → open roles → prospects.**
8. **Activity log last** — it references everything.
9. **Reconcile, freeze, delta re-sync, sign-off.**

The completeness guarantee is one invariant, enforced per tab at every step:

> **inserted + updated + skipped + errored == source row count**

with every skip and every error carrying a reason. Rows may be deliberately excluded; they may never
be silently absent. Errored rows must be resolved and re-run, not dropped — the importer correctly
excludes them from commit, which is only safe if a human reads the list.
