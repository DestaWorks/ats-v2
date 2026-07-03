# Data Model — DestaHealth ATS

Reconstructed from `index.html`. Field lists are derived from how the client reads/writes
records; the authoritative schema is the Google Sheet (not in this repo). Use this to design
the PostgreSQL schema. Fields marked _(?)_ are inferred and need confirmation.

---

## Entities

### Candidate
The central pipeline record.

| Field | Notes |
|-------|-------|
| `CandidateID` / `id` | Primary key (uuid) |
| `legacy_id` | Original Sheet ID — carried for idempotent ETL upsert |
| `Name` | |
| `Email`, `Phone` | Contact (one required by most stage gates). **Sensitive** — role/capability-restricted in DTO + encrypted at rest. `Email` is the dedupe key (see migration). |
| `Credential` | e.g. PMHNP, PMHNP-BC, MD, DO, PsyD, PhD, LCSW, LPC, LMHC, LMFT, NP |
| `LicenseState` | 2-letter state |
| `LicenseStatus` | `Not Verified` / `Active` / `Expired` / `Under Investigation` |
| `LicenseNumber` _(?)_ | **Sensitive** — role/capability-restricted in DTO + encrypted at rest |
| `LicenseExpiry` | Nullable, **indexed** — drives the verification queue / expiry timeline (D4) |
| `NPI` _(?)_ | National Provider Identifier. **Sensitive** — role/capability-restricted in DTO + encrypted at rest |
| `Status` | Stable **code** (not label) — see below; scoring/gates/funnels key off code/ordinal |
| `Client` / `client_id` | **FK to `clients` from day one** (seeded from `BASE_CLIENTS`); not a free-text label |
| `Source` | Indeed, LinkedIn, Rocket Reach, Referral, Scraped, etc. |
| `Track` | `Clinical` (default) or `Operations` |
| `Population` | e.g. Child/Adolescent, Adult |
| `Setting` | Outpatient / Hybrid / Telehealth / Inpatient |
| `City`, `State` | Location |
| `TelehealthPref`, `YearsExp`, `Employer` _(?)_ | |
| `Tags` | from `TAGS` (Priority, Silver Medalist, Bilingual, Compact License, …) |
| `AddedBy`, `AddedAt` | Creation actor + timestamp |
| `UpdatedAt` | Generic last-write timestamp — **does NOT drive SLA / days-in-stage** (use `stage_entered_at`) |
| `stage_entered_at` | Denormalized timestamp of the current stage entry — **the source for stage SLA / "days in stage"** (mirrors latest `stage_history` row) |
| `placed_at` | Denormalized timestamp the candidate reached `STARTED_DAY1` |
| `Avatar` _(?)_ | |
| Soft-delete flags | `deleted_at` — supports delete/restore/purge (see lifecycle) |

**Pipeline stages (`STATUSES`) — codes, not labels**
Status is stored as a **stable code** with a numeric `stage_order` ordinal and a display-label
lookup. **Scoring, stage gates, and funnels key off the code/ordinal — never the label** (so
labels can be re-worded without breaking logic). Defined in `lib/constants`.

| Code | `stage_order` | Display label |
|------|---------------|---------------|
| `NEW_CANDIDATE` | 0 | New Candidate |
| `QUALIFIED_PRESCREEN` | 1 | Qualified (Pre-Screen) |
| `INITIAL_SCREENING` | 2 | Initial Screening |
| `DESTA_REVIEW` | 3 | Desta Review |
| `SUBMITTED_TO_CLIENT` | 4 | Submitted to Client |
| `CLIENT_INTERVIEW` | 5 | Client Interview |
| `OFFER_NEGOTIATION` | 6 | Offer / Negotiation |
| `OFFER_ACCEPTED` | 7 | Offer Accepted |
| `STARTED_DAY1` | 8 | Started (Day 1) |
| `NOT_QUALIFIED` | 9 | Not Qualified |
| `NO_RESPONSE` | 10 | No Response |
| `CLIENT_REJECTED` | 11 | Client Rejected |
| `FUTURE_PIPELINE` | 12 | Future Pipeline |

Terminal: `NOT_QUALIFIED`, `NO_RESPONSE`, `CLIENT_REJECTED`, `FUTURE_PIPELINE`. Compact-state
and "active" subsets exist (`COMPACT_STATES`, `TERMINAL_STATUSES`) — also keyed by code.

**Lifecycle**: create → move through stages → soft-delete (`ats_delete_candidate`) →
restore (`ats_restore_candidate`) → hard purge (`ats_purge_candidate`). Each change is
logged via `ats_log`.

---

### SourceLead
Pre-pipeline sourcing record. Promoted into a Candidate.

| Field | Notes |
|-------|-------|
| `SL_ID` | Primary key |
| `Name` | |
| `LinkedinURL`, `Email`, `Phone` | |
| `Credential` (a.k.a. Job Title raw) | |
| `Source`, `TargetClient` | |
| `City`, `State` | |
| `Status` | `Sourced` / `Outreach 1` / `Outreach 2` / `Outreach 3 (Final)` / `Responded — Hot` / `Responded — Cold` / `No Response` / `Bad Fit` / `Future Collaboration` / `Promoted` |
| `OutreachAttempts` | Legacy JSON array `{by, channel, template, sent_at, response, response_at}`; normalized into the shared **`outreach_attempts`** table (nullable `lead_id` here, nullable `candidate_id` for candidates) |
| `legacy_id` | For idempotent ETL upsert |
| `Notes` | |
| `SourcedBy` / `importedBy` | |
| `SnoozedUntil` | Snooze timestamp |
| Soft-delete | bulk soft-delete with 30s undo (`source_lead_undelete`) |

---

### Profile / User
| Field | Notes |
|-------|-------|
| `Email` | Identity key |
| `Name` (`user`) | Display name |
| `Role` | Exactly **one** of a **fixed enum**: `Owner / Director / Manager / Screener / Associate / Admin`. `admin` is a **role value**, not a separate boolean flag |
| `Avatar` | Image (resized client-side) |
| `EmailSignature` | Stored per user (currently localStorage too) |
| Password _(?)_ | Backend-managed (change/reset/forgot) |
| Blocked state | Admin can block/unblock |

> `BASE_ROLES` currently hardcodes some users by name. `USER_ROLES` merges base + custom.
> The target model stores roles in the DB, not in code.

**Roles & capabilities.** The 6 roles above are a **fixed enum**. "Leadership" is **not** a
role — it is a **capability group** derived from role via a **capability map** (e.g.
`viewReports`, `bulkImport`, `viewCredentials`, `viewAudit`, `purgeCandidate`). Guards check
capabilities, not role literals. **Custom roles are deferred to v2**; v1 ships the fixed enum +
capability map only.

---

### Note / Mention
| Field | Notes |
|-------|-------|
| `CandidateID` | Foreign key |
| Note type | internal vs external (`.note-int` / `.note-ext` styling) |
| Body, author, timestamp | |
| Mentions | `@user` mentions create Mention records with `MentionID`, `recipientEmail`, read state |

---

### Activity / Audit log
Append-only log via `ats_log`. Records actor, action, target, timestamp. This is the audit
trail and is a first-class DB table (`activity_log`) in the target system.

**Audit vs application logs (important distinction):** `activity_log(before, after)`
**intentionally stores PII** (the previous/next values of a changed record) — it is the
compliance audit trail, kept under **access control + encryption at rest**, and `before`/`after`
reads are **restricted by capability** (e.g. `can('viewAudit')`). By contrast, **application /
observability logs must never contain PII/PHI**. Do not conflate the two.

---

### Client
A **minimal `clients` table exists from day one** (Wave 1), seeded from `BASE_CLIENTS`, so
`candidates.client_id` is a real FK before the rich CRM UI lands later.

| Field | Notes |
|-------|-------|
| `id` | Primary key (uuid) |
| `legacy_id` | For idempotent ETL upsert |
| Name | from `BASE_CLIENTS` + custom added clients |
| `capacity` | Open headcount / how many placements the client can take |
| Matching rules | Live in the **`client_rules` table** (data, not code) — allowed states, creds, populations, settings, priority, autoDisqualify. See `client_rules` below and `scoreCandidate(candidate, clientRules)`. |
| Contacts | `client_contacts` records (add/delete) |
| Profile | `client_profile` (save/delete) |

**Base clients**: Sterling Institute, Contemporary Care, DOCs Medical Group,
Ritu Suri & Associates, NJ-Psych Candidates, Future Potential Clients.

---

### OpenRole (requisition)
| Field | Notes |
|-------|-------|
| Title, Credential, State, City | |
| Setting, Population, Rate, Priority | Priority e.g. P1/P2 |
| Description | |
| Source | internal or client-posted via portal (`portal_post_role`) |

---

### Deal (CRM)
Client/business deal record — update/close/delete (`deal_*`). Fields TBD from backend.

---

### Brief (Daily / Weekly)
AI-generated briefing records, archived. Daily: priority client, shifts, watch items.
Weekly: highlights, blockers, flags, next-week priorities, detected patterns.

---

### Targets / Actuals (KPI)
Per-associate goals (`ats_targets_*`) vs. actuals (`ats_actuals_*`); pipeline health
(`ats_pipeline_health`). Drives Reports / KPI / Performance views.

---

## Derived logic to preserve (currently client-side)

| Logic | Where | Move to |
|-------|-------|---------|
| `scoreCandidate(candidate, clientRules)` — fit % | client | server; **pure**, takes rules loaded from `client_rules` as an argument (so custom clients score) |
| `getAutoDisqualify(c)` | client | server |
| `STAGE_REQUIRED` — track-aware stage gates | client | **server** (must be enforced, not advisory) |
| `STAGE_ALERTS` — per-stage SLA days | client | server/config |
| `getDaysInStage`, overdue/stuck/hot/needs-verify | client | server-computed or shared lib |
| `normalizeStatus` — lead status normalization | client | server (import pipeline) |

---

## Proposed PostgreSQL schema (starting point)

**Core tables:** `users`, `candidates`, `candidate_notes`, `mentions`, `source_leads`,
`outreach_attempts`, `clients`, `client_contacts`, `client_rules`, `open_roles`, `deals`,
`briefs`, `targets`, `actuals`, `activity_log`, `access_requests`, `invites`,
`verification_presets`.

**Additional tables (previously missing — add these):**

| Table | Key columns / purpose |
|-------|-----------------------|
| `stage_history` | `candidate_id`, `from_stage`, `to_stage`, `entered_at`, `actor_id` — the per-candidate stage-transition ledger; `stage_entered_at`/`placed_at` on `candidates` are denormalized from here |
| `client_rules` | Matching rules **as data** (per client): allowed states/creds/populations/settings, priority, autoDisqualify. Consumed by `scoreCandidate(candidate, clientRules)` |
| `role_notes` | Notes attached to an open role / requisition |
| `deal_blockers` | Blockers on a CRM deal |
| `client_match_profiles` | Saved client matching profiles (target ideal-candidate shape) |
| `daily_logs` | Per-associate daily accountability log (Overview / Daily Log loop) |
| `journal_entries` | Free-form journal entries |
| `journal_goals` | Journal goals / targets |
| `manager_feedback` | Manager feedback records |
| `shift_handoffs` | Shift-handoff notes |
| `documents` | **File metadata only** (resume/docs): name, mime, size, owner, signed-URL key — bytes live in object storage |
| `saved_views` | Persisted shareable filters/views (replaces localStorage for shareable state) |

**Cross-cutting columns** on every business table: `id` (uuid), `created_at`, `updated_at`,
`created_by`, `deleted_at` (soft-delete). Every **migratable** entity also carries a
**`legacy_id`** column for **idempotent upsert** from the Sheet ETL.

**Migration dedupe / merge:** dedupe is **email-primary** (name is secondary / manual-review);
merge policy is **keep-newest + flag** for human review. Résumé→profile matching requires a
confidence threshold + manual confirm (no silent wrong-person PII matches).

**Enums:** enforce `role`, `track`, `license_status` as DB enums. **Status** is a stable-code
enum with a `stage_order` ordinal + display-label lookup (labels are not stored on rows).

**Audit:** generic `activity_log(actor, action, entity, entity_id, before, after, at)`.
`before`/`after` hold PII intentionally → access-controlled + encrypted, reads gated by
capability (see Activity / Audit log above). App/observability logs never carry PII.

**Soft-delete:** a **shared Prisma extension/helper applies `deleted_at IS NULL` by default**
on reads, so soft-deleted PII never leaks into lists (opt-in to include trashed rows).

**Indexes:**
- `candidates(status)`, `candidates(client_id)`, `candidates(LicenseExpiry)`
- `source_leads(status)`
- `activity_log(entity, entity_id)`, `activity_log(actor, at)`
- `stage_history(candidate_id)`
- `outreach_attempts(lead_id)`, `outreach_attempts(actor, day)`
- `mentions(recipient, read)`
- the `deleted_at` soft-delete column on every business table
