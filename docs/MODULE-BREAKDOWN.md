# Module Breakdown — Legacy ATS (`index.html`)

A deep, line-level map of the entire 9,531-line legacy app, produced by reading every section.
For each module: sub-modules, sub-tasks to rebuild, key functions/state, backend events,
integrations, and a **complexity rating (Logic 1–5 / Implementation 1–5)** with the hidden
gotchas that will bite during the rebuild.

> **How to read complexity:** *Logic* = how hard the rules/math/algorithms are (the part AI
> assistance helps least with — see `docs/ESTIMATE.md`). *Implementation* = sheer volume /
> wiring / UI density. A module can be Logic-2 but Implementation-5 (lots of dumb code) or
> Logic-5 but Implementation-3 (small but brain-bending).

---

## 0. App-wide structure (read first)

- **One file, one `App()` function** with **~180 `useState` hooks** (not 150) in a single scope
  — hook order is load-bearing (`"hooks must always be called in same order"`, line 247).
- **Backend = one Google Apps Script endpoint** (`U`). Two transports: `post()` =
  fire-and-forget `mode:"no-cors"` (no readable response, followed by `setTimeout(load,…)`);
  `postJSON()` = `text/plain` POST returning JSON. A plain `GET U` returns the entire DB.
- **~90 operations are multiplexed by an `event:"…"` string** (full catalog at the end). The
  generic `ats_log` event is itself overloaded to carry `daily_log`, `shift_handoff`,
  `mgr_feedback`, `journal_entry`, `journal_goal`, `assign_role`, `create_role`, and all
  `crm_*` sub-actions via an `action` field.
- **Config-as-event-log:** clients, custom roles, role assignments, and most CRM records are
  **reconstructed by scanning `db.activity` for magic Action strings on every render** —
  mutating module-level globals (`USER_ROLES`, `CUSTOM_ROLES`, `CLIENTS`) as a render side
  effect. There are no real tables for these.
- **AI = Gemini inside Apps Script** today (the client only assembles context + renders). Our
  rebuild moves this to the Claude API server-side.
- **No memoization anywhere** — every panel re-derives from `candidates`/`db.activity` on each
  render (O(n·activity)); the Weekly/Brief/CRM analytics re-parse `OutreachAttempts` JSON for
  every lead many times per render. This is the #1 perf refactor.
- **Auth/role is 100% client-trusted** (details in §2) — the #1 security issue.
- **Three different "week" definitions coexist** (Monday-anchored targets, Sunday-anchored
  weekly brief, rolling-7-day trends) so numbers labeled "this week" disagree across screens.
- **`UpdatedAt` is overloaded as "stage-entry time" AND "placement date"** in every
  time-in-stage / time-to-fill / TTP computation — a shared data-model weakness.

### Complexity heatmap (module → Logic / Impl)

| Module | Logic | Impl | Notes |
|--------|:---:|:---:|-------|
| Foundations & Rules Engine | 4 | 5 | scoring + gates + ~180-hook state graph |
| Auth & App Shell | 4 | 3 | client-trusted auth is the risk, not the code |
| Overview / Home | 4 | 4 | 11 independent AI/analytic panels |
| Daily Log & Journal | 5 | 5 | tenure ramps, streaks, pacing, append-only logs |
| **Pipeline** (kanban+table) | 4 | 5 | DnD + stage gates + dual filter systems |
| **Candidate Detail Modal** | 5 | 5 | @mention parser, gates, cross-platform handoff |
| Parse Resume + rendering | 4 | 4 | PDF→vision pipeline + 3 resume layouts |
| Templates | 4 | 4 | dual recipient model + token engine |
| **Sourcing** | 5 | 5 | outreach state machine, chunked import, promote |
| Discover / NPPES | 4 | 5 | cross-system dedupe + enrichment + supply gaps |
| **Open Roles** (+ JD AI) | 5 | 5 | weighted matcher + triage + SLA + dormant |
| Daily Brief | 5 | 4 | live-actuals engine + AI context + accountability |
| Weekly Brief | 5 | 5 | dual-range stats + funnels + 4-week patterns |
| Inbound Triage | 2 | 2 | additive scoring; extraction is server-side |
| Screening Scorecards | 4 | 3 | 6 weighted sections with edge cases |
| **CRM** | 5 | 5 | churn risk + contact strength + deal probability |
| Client Portal | 2 | 2 | read-only report |
| **Reports** (9 types) | 5 | 5 | Mass Journey Gantt is the peak |
| Admin | 4 | 4 | log-based RBAC + permission matrix |
| **Bulk Import / Migration** | 5 | 5 | client-side ZIP→base64 + AI match wizard |
| Perf | 3 | 2 | hardcoded targets |
| Learn | 1 | 2 | static tutorial |

---

## 1. Foundations & Rules Engine  — lines 78–846
The config + pure-rules + global-state hub everything depends on.

**Sub-modules**
- **Constants/config** (78–118): endpoint `U`, `post`/`postJSON`, palette `C`, `STATUSES` (13),
  `SC` colors, `BASE_CLIENTS`, `SOURCES`, `ROLES`/`ROLE_COLORS`/`BASE_ROLES`, `CREDS`, `LL`
  license portals, `ADMINS`.
- **Rules engine (CORE)** (133–186): `CLIENT_RULES` (per-client states/creds/pops/settings/
  priority/autoDisqualify); `scoreCandidate` (weighted **State 30 / Cred 30 / Pop 20 / Setting
  10 / License 10**, dynamic max → relative %); `getAutoDisqualify` (hard DQ); `STAGE_REQUIRED`
  (track-aware stage-gate validators); `STAGE_ALERTS` (per-stage SLA days); `COMPACT_STATES`,
  `getDaysInStage`.
- **App state block** (214–760): **~180 useState hooks** across ~15 domains (session/auth,
  learn, portal, pipeline, briefs, targets, mentions, sourcing ~30 hooks, open-roles ~25, CRM,
  daily-log, reports, table). Several localStorage-backed (lazy init + write-back).
- **Data load** (780–844): `load()` GETs the whole DB (12+ collections) + 30s poll; derives
  `candidates`, `candidatesAll`, dynamic `CLIENTS`/`USER_ROLES`, `kpi`, `isAdmin`,
  `isLeadership`.
- **AI fetchers**: `fetchPipelineHealth` (308–341), `fetchOverviewBrief` (343–397, builds a rich
  context incl. a velocity block).
- **Targets/actuals engine** (439–499): `liveActuals(name,date)` computes actuals from
  `sourcedLeads`+`activity` client-side; effect fetches server targets/actuals.
- **Table sort/filter** (748–771): `applyTableFilters`/`applyTableSort`/`cycleTSort`, overloaded
  `tFStatus`.

**Backend events:** `ats_log`, `reset_password`, `ats_pipeline_health`,
`ats_overview_brief_get_or_generate`, `ats_targets_get`, `ats_actuals_get`, `ats_get_mentions`,
`portal_*`.
**Complexity — Logic 4 / Impl 5.**
**Gotchas:** var-hoisting hazard (effects reference state declared later, guarded by
`typeof`); mutable globals mutated during render; scoring `max` is per-client relative;
`STAGE_ALERTS[status]*24h` overdue math is duplicated in ≥4 places.

---

## 2. Auth & App Shell — lines 793–1610
**Sub-modules:** Auth screens (sign-in / Google / request-access / forgot-password); session
restore; header; role-gated sidebar; Alerts panel; Trash modal; Mentions inbox; End-of-Shift
modal.
**Sub-tasks:** email/password + GSI Google flow with manual OAuth fallback; session persistence;
role-gated nav (`isLeadership`/`isAdmin`); derived alert buckets (overdue/new/unverified);
soft-delete trash w/ 30-day countdown; @mention inbox.
**Key fns:** `trySignIn`, `handleGoogleSignIn`, `saveSession`, `forgotPassword`, `markAllRead`,
`openMention`, `daysLeft`.
**Backend events:** `access_request`, `reset_password`, `ats_log`, `ats_get_mentions`,
`ats_mark_mention_read`, `ats_restore_candidate`, `ats_purge_candidate`, `ats_actuals_save`.
**Complexity — Logic 4 / Impl 3.**
**Gotchas (SECURITY):** admin login is a **hardcoded shared password** (`pw==="desta"`, and
`ADMINS` includes `"b"`); role is stored in web storage and **re-read verbatim on load** (edit
JSON → become admin); Google JWT is **decoded but not verified**; nav gating is UI-only
(data calls behind gated views are still reachable). Mark-read does a read-then-refetch chain.

---

## 3. Overview / Home — lines 1611–2151
Morning command center: **11 independent IIFE panels**, each `try/catch`-guarded so one failure
doesn't crash the page.
**Sub-modules:** greeting+CTAs; **Today's Targets strip** (pace vs 9–5 ramp); **Overview Brief**
(AI narrative, cached per-day); **Action Queue** (AI actions, mailto drafts, park); **"Since you
closed" diff** (activity bucketed since last-seen); **Relationship Intelligence** (client cadence
anomaly); **Copilot walker** (guided wizard through actions); Client Snapshots; **Pipeline
Distribution** (funnel + biggest-leak); **Team Pulse**; Top Candidates; Recent Activity.
**Backend events:** `ats_overview_brief_get_or_generate`, `ats_park_action`.
**Complexity — Logic 4 / Impl 4.**
**Gotchas:** action-queue dismissal is **keyed by array index**; Copilot uses
`ovActions.indexOf(act)` object identity — both silently break if actions refetch mid-session.
Copilot approvals are local-only (not persisted). "Since you closed" relies on string-matching
`Action` values; `lastSeen` only advances after 30s dwell. No memoization.

---

## 4. Daily Log & Journal — lines 2153–2537
**Sub-modules:** Daily Log (`vw==="dailylog"`) — live shift tracker, **tenure-based ramp
targets** (Training/Ramp/Full by weeks since `2026-04-13`), streaks, **predictive pacing**,
7-day trend, week target-vs-actual, **Indeed credit burn**, manager feedback, admin team
breakdown; Journal (`vw==="journal"`) — daily notes, weekly goals, history.
**Key fns:** `saveLog`, `kpiColor`; heavy per-day JSON parsing of `daily_log` activity rows.
**Backend events:** `ats_log` (actions `daily_log`, `shift_handoff`, `mgr_feedback`,
`journal_entry`, `journal_goal`).
**Complexity — Logic 5 / Impl 5** (densest single block: ~14 features from JSON-in-string logs).
**Gotchas:** data lives as `daily_log` activity rows whose `Details` is a JSON string (every
consumer re-parses with silent `catch`); **two week definitions** in one feature (Sunday for
logs, Monday for targets); **two parallel truth sources** — self-reported Daily Log vs
event-derived `liveActuals`; goals are append-only (toggling `done` re-posts, can duplicate).

---

## 5. Pipeline (Kanban + Table) — lines 2539–2824
**Sub-modules:** AI Health strip (`ats_pipeline_health`); Chips + Saved Views (5 predicates:
mine/overdue/stuck/hot/verify; per-user localStorage views); Toolbar (collapse empties, bulk
select); **Kanban board/cards** (hand-rolled HTML5 DnD, score/track/license badges); Table view
(advanced filters, tri-state sort).
**Backend events:** `ats_move_candidate` (drag = **stage-gate enforced/blocked**; bulk =
**ungated**), `ats_park_action`, `ats_pipeline_health`.
**Complexity — Logic 4 / Impl 5.**
**Gotchas:** **stage-gate asymmetry** — drag path hard-blocks via `STAGE_REQUIRED`; the bulk-move
path bypasses gates entirely. Chip predicates are duplicated (`pChipDefs` vs inline
`chipFilter`); save-view body inlined 3×; **two independent filter namespaces** (`kFilter*`
kanban vs `tF*` table) that don't share state; optimistic moves rely on `setTimeout(load,1500)`.

---

## 6. Candidate Detail Modal — lines 9380–9527  ⭐ richest single-record editor
**Sub-modules:** header + **Track editor pill**; **stage mover with validation gates** + score/
disqualify chips; conditional tab bar (Details / License / **Resume** if `ResumeURL` / Notes);
Details quick-actions (open in Templates/Screening, delete); **track-aware License editor**
(Operations shows "no license required"); Resume tab (Drive iframe); **Notes tab with cursor-
aware @mention autocomplete** + keyboard nav + role-scoped visibility + outreach history.
**Backend events:** `ats_update_candidate`, `ats_move_candidate`, **`op_add_provider`
(auto-handoff to the "Operate" platform when moved to Started)**, `ats_delete_candidate`,
`ats_verify_license`, `ats_add_note`, `ats_notify_mention`, `candidate_log_outreach`.
**Complexity — Logic 5 / Impl 5.**
**Gotchas:** `op_add_provider` uses `"P"+Date.now()` id — **no idempotency**, re-moving to
Started duplicates providers; note text rendered with **`dangerouslySetInnerHTML`** (stored-XSS
surface); non-admin note hiding is **client-side only** (hidden notes still shipped to browser);
mention resolution matches first name → notifies name-collisions; license editor local state
doesn't re-sync on background refresh.

---

## 7. Parse Resume + Rendering — lines 3168–3634
**Sub-modules:** Upload/Extract (drag-drop PDF → pdf.js text **and** base64 → AI `extract_resume`
in `vision` or `text` mode; role picker); **Resume render-helpers** (3 layouts —
clinical/prescriber/operations — brand header, name block, snapshot, licensure table, systems/
tools, hospital affiliations, experience, education, publications, skills, pills; all inline-
editable via `contentEditable`); Print/Mail (title-swap print hack, Gmail/Outlook/Yahoo/mailto).
**Backend events:** `extract_resume`.
**Complexity — Logic 4 / Impl 4.**
**Gotchas:** vision (base64) preferred over pasted text; `updateP` deep-clones the whole parsed
object on every field blur; `contentEditable` values only commit on blur (React re-render can
clobber unsaved edits); no add/remove-row UI (structure fixed to what AI returned); emailed body
is a stub — the resume must be attached manually.

---

## 8. Templates — lines 3637–3837
**Sub-modules:** categorized template library (5 categories); **dual recipient model**
(candidate OR sourced-lead adapter); `fillTemplate` (~30 `{token}` regex replaces + signature);
copy / open-in-Gmail; log-sent.
**Backend events:** `source_lead_log_outreach` (lead) or `ats_add_note` (candidate).
**Complexity — Logic 4 / Impl 4.**
**Gotchas:** `{role}`→`Credential`, `{client}`→raw name; sequential regex order matters;
lead-synthesized candidate leaves many empty fields (fallbacks kick in); `logSent` mixes
`post`/`postJSON` inconsistently.

---

## 9. Sourcing — lines 4353–4655  ⭐
**Sub-modules:** lead inventory (filters/search, 500-cap); **outreach state machine**
(`SL_STATUSES`: Sourced → Outreach 1/2/3 → Responded Hot/Cold → …); log/edit/bulk-log/delete
attempts; bulk actions (status/assign/client/**soft-delete with 30s undo**); snooze;
**promote-to-pipeline** (optimistic, auto-opens new candidate); **chunked CSV/XLSX import**
(`CHUNK=200`, header-alias mapping, `normalizeStatus`); 5 modals.
**Backend events:** `source_lead_add`, `source_lead_bulk_import`, `source_lead_bulk_action`,
`source_lead_undelete`, `source_lead_log_outreach`, `source_lead_edit_outreach`,
`source_lead_delete_outreach`, `source_lead_promote`, `source_lead_snooze`,
`source_lead_bulk_log_outreach`.
**Complexity — Logic 5 / Impl 5.**
**Gotchas:** naive CSV parser (`split(",")` breaks on quoted commas); `OutreachAttempts` is a
JSON **string column** parsed everywhere; import is sequential per chunk; promote auto-open
depends on backend returning `candidateId`.

---

## 10. Discover / NPPES — lines 3840–4237
**Sub-modules:** **Coverage Gaps** (open-role demand vs sourced/pipeline/NPPES supply → gap,
7-day cache); Boolean Search Builder; **NPPES provider search** (federal NPI registry via GET,
cross-system dedupe by NPI + name, single/bulk **contact enrichment**, add-to-sourcing with
owner/client, 17 audited state-board verify URLs + Google fallback); legacy prospect log.
**Backend events:** `enrich_provider_contact`, `source_lead_add`, `ats_add_candidate` (legacy),
`ats_log` (prospect); NPPES via `GET U?type=nppes`.
**Complexity — Logic 4 / Impl 5.**
**Gotchas:** taxonomy code vs label mismatch between coverage fetch and search seed; NPI
extracted from free-text via regex; "capped at 50" understates gaps; enrichment is per-session
(not persisted) but carried into the sourcing payload.

---

## 11. Open Roles (+ JD AI) — lines 4658–5198  ⭐
**Sub-modules:** role inventory/filters; **weighted lead→role matcher** (`scoreMatch` +
per-client weight profiles); **triage strip** ("top 3 to work now" multi-factor rank + reason
picker); **SLA/aging chips** (per-priority buckets, health states); inline top-3 matches +
one-click promote; **dormant re-engagement** (separate fixed-weight scorer); role activity
timeline + notes; **JD → AI auto-fill** (paste/PDF/image → `ats_parse_jd` → merge into form);
add/edit role + match-profile editor.
**Backend events:** `open_role_add/update/delete`, `client_profile_save/delete`,
`role_note_add/delete`, `source_lead_promote`, `ats_parse_jd`.
**Complexity — Logic 5 / Impl 5.**
**Gotchas:** **two separate scoring systems** (active weighted vs dormant fixed); triage score
and match score are unrelated scales; SLA chips recompute O(roles×candidates) per render; two
promote payloads (inline vs modal) differ slightly.

---

## 12. Daily Brief — lines 5277–6080  ⭐
**Sub-modules:** masthead generate/refresh (**two mastheads** — visible thin-context + hidden
full-context); manager **target-setting** (backward from weekly goal, AI-suggested); live **Team
Pulse** (pace-adjusted); Yesterday results/notes; **Week-to-Date "Hits/5"**; **`liveActuals`
engine** (actuals from logs); **AI brief context assembly** (perAssoc/perClient rollups,
exceptions, yesterday-commitments accountability loop); plain-text export; distribute/archive.
**Backend events:** `daily_brief_generate/save`, `ats_targets_get/set/suggest`, `ats_actuals_get`,
`ats_notify_mention`.
**Complexity — Logic 5 / Impl 4.**
**Gotchas:** `aiSuggest`/`saveTargets` **redeclared twice** (IIFE scope isolation); `hits`
computation `SourcingActual >= SourcingActual*1` is an always-true **bug**; fragile 3-strategy
email matching (synthetic `name@desta.local`); pervasive **demo-mode seeding** when no real data.

---

## 13. Weekly Brief — lines 6083–6557  ⭐
**Sub-modules:** KPI ribbon with **WoW deltas** (`statsForRange` dual-range engine); per-client
+ per-associate scorecards; last-week commitment accountability; decisions log; branded
print-to-PDF; **4-week Patterns** (`weekly_brief_patterns`, LLM-detected); **Anomalies + Funnel +
W/M/Q trends** (rolling windows, 6 metrics × 3 horizons, goal-vs-actual).
**Backend events:** `weekly_brief_generate/save/patterns`.
**Complexity — Logic 5 / Impl 5** (the anomalies/trends block ≈ 36 full-table scans per render —
the most compute-dense in the app).
**Gotchas:** "promoted"/"stuck" each have **two divergent definitions** (activity-action vs
candidate-Tags); the two weekly panels use different week windows (last-completed Mon–Sun vs
rolling-7d), so "this week" disagrees; funnel mixes tables/timestamps → conversion % can exceed
100%; `statsForRange` re-parses all outreach JSON many times.

---

## 14. Inbound Triage — lines 6559–6687
Paste message → AI extract → additive match vs open roles (max 70, ≥15) → save as Hot lead.
**Backend events:** `inbound_triage`, `source_lead_add`.
**Complexity — Logic 2 / Impl 2.** Gotcha: auto-picks `matchedRoles[0]` client; no dedupe.

---

## 15. Screening Scorecards — lines 6689–6934
Weighted auto-score from 6 sections (**cred 25 / state 20 / exp 20 / schedule 15 / salary 10 /
comm 10**) → Advance/Conditional/Hold; auto-moves to Submitted (≥75) or Future Pipeline (<60).
**Backend events:** `ats_add_note`, `ats_move_candidate`.
**Complexity — Logic 4 / Impl 3.**
**Gotchas:** state default 50 when client specifies none (inflates weak candidates); "below
salary range" is penalized though it's favorable; scorecard saved only as free-text note (not
re-parseable).

---

## 16. CRM — lines 6936–8063  ⭐ (14 tabs; the analytic heart)
**Sub-modules:** add-client; AI Client Workspace (`crm_ai_workspace`); **Predictive Churn Risk**
(6 weighted signals incl. recency-weighted sentiment + exponential placement-velocity decay);
**Revenue & Profitability** (annualized retainer + placement ARR, time-ROI proxy); Health score;
Compare dashboard; Pipeline; Client Info; Open Roles; **Contacts (DROP 74)** — per-contact
**strength score** (recency/frequency/sentiment/role-weight/response-rate), champion/detractor
classification, **whitespace detection** (untracked email addresses via regex), role-gap
detection; Tasks; Meetings; Timeline; **Communication + Gmail sync**; **Deals (DROP 76)** —
**rule-based close-probability engine** (stage base ± stakeholder relationship scoring ± blockers
± recency), weighted forecast, post-mortem close; Documents; multi-client Email Updates;
Onboarding.
**Backend events:** `crm_ai_workspace`, `crm_email_pull`, `client_contact_add/update/delete`,
`deal_add/update/close/delete`, plus `ats_log` `crm_*` actions.
**Complexity — Logic 5 / Impl 5.**
**Gotchas:** **two storage paradigms** — structured tables (`clientContacts`, `deals`) for newer
features vs unstructured delimited/JSON activity rows for the rest; **email sentiment/response
scoring is reimplemented three times** (churn risk, contact strength, deal probability) — the
highest-value consolidation target; deal recency uses whole-client activity (any touch lifts
every deal); generous "no data" defaults make empty clients look healthy.

---

## 17. Client Portal — lines 8066–8103
Read-only, printable per-client pipeline report (`?portal=true` external mode is separate, §2).
**Complexity — Logic 2 / Impl 2.** Gotcha: `Verified` tile counts only `LicenseStatus==="Active"`
(Operations candidates read as unverified); `fc==="all"` silently shows `CLIENTS[0]`.

---

## 18. Reports — lines 8106–8683  ⭐ (9 report types)
Universal filter bar + CSV export, then 9 client-side analytic reports: **Executive Summary**;
**Per-Client Funnel** (WoW deltas via `stageAtDate` activity replay); **Mass Journey** (⭐ a real
swimlane **Gantt** — segment reconstruction, median/P90 time-to-place, bottleneck detection,
200-row cap, absolute-positioned overlays); **Pipeline Funnel** (cumulative); **Team
Performance**; **Source ROI**; **Client Portfolio**; **Time Analysis** (time-in-stage + TTF vs a
hardcoded "83" industry avg); **Compliance**.
**Backend events:** none (pure computation) + CSV/print.
**Complexity — Logic 5 / Impl 5** (Mass Journey is the peak).
**Gotchas:** every report recomputes O(n·activity) per render; WoW "delta" is actually a lagged
`(stage@7d) − (stage@14d)`; TTP trusts `UpdatedAt` as placement date; funnels are
`STATUSES.indexOf`-coupled (rejected candidates still count toward earlier stages).

---

## 19. Admin — lines 9007–9336 (8 tabs)
Users (add/search/bulk-role/reset-pw/platform toggles/onboarding rings), Requests
(approve/decline), Roles (create custom), **Permissions matrix** (14 features × roles, display-
only), Shifts, Blocked, Team Profiles, Audit Log.
**Backend events:** `add_invite`, `update_invite`, `remove_invite`, `block_user`,
`unblock_user`, `approve_request`, `decline_request`, `resend_welcome`, `change_password`,
`ats_log` (`assign_role`/`create_role`).
**Complexity — Logic 4 / Impl 4.**
**Gotchas:** **roles/custom-roles are stored as audit-log events, not a roles table**; the
permission matrix is display-only and may diverge from what's actually enforced; shift
assignment isn't modeled (every associate shows in both shifts); declines are triple-recorded
(event + audit + localStorage) as a reliability hack; temp passwords shown in plaintext.

---

## 20. Bulk Import / Migration — lines 1417–1609  ⭐
3-step wizard: upload Indrasur CSV + **resume ZIP extracted client-side with JSZip → base64**;
`migration_prepare` returns dedupe/owner/status-mapped preview; inspect modal (Drive iframe);
`migration_commit` runs AI parse + Drive upload + candidate creation.
**Backend events:** `migration_prepare`, `migration_commit`.
**Complexity — Logic 5 / Impl 5.**
**Gotchas:** **whole ZIP base64-encoded in-browser and shipped in one POST** (warns >40MB, no
chunking); extraction logic **duplicated twice**; the inspect-modal "include" checkbox reduces to
always-true (**likely bug**); rows with no matched resume silently dropped on commit.

---

## 21. Perf — lines 4240–4349
Hardcoded KPI targets per client + associate leaderboard (composite score). **Logic 3 / Impl 2.**
Gotcha: only 4 clients have targets; stage thresholds `STATUSES.indexOf`-coupled; `ASSOC_TARGETS`
defined but unused.

## 22. Learn — lines 5200–5275
Static 8-chapter tutorial with progress + "Try it" deep-links. **Logic 1 / Impl 2.**

## 24. Credentials Intelligence (`matrix`) — lines 2964–3167  *(added after re-check)*
Leadership dashboard (sidebar "Credentials"). **Sub-modules:** 6 stat cards (total/active/
unverified/expired/expiring-<90d/NLC compact); **Verification Queue** (candidates needing
verification + state-board links); **License Expiry Timeline** (countdown, color-coded, uses
`LicenseExpiry`); **credential×state coverage matrix**; **gap/coverage mapping**; NLC compact-
license tracking; Print/PDF. **Backend events:** none (read-only over candidates + license fields).
**Complexity — Logic 3 / Impl 3.** **Gotcha:** needs a `LicenseExpiry` date field on candidates
(not in the base field notes); Operations-track candidates read as "unverified" here.

## 25. Standalone Analytics (`kpi`) & Activity Log (`activity`) — lines 2827–2961  *(added after re-check)*
Two views the pipeline-range analysis didn't break out. **Analytics (`kpi`):** period/user-filtered
By-Status/Client/Source breakdowns, Time-to-Fill, Source-of-Hire, and a unique **Client Capacity**
feature (per-client capacity limits + "approaching capacity → open a new req" alert). **Activity Log
(`activity`):** standalone filterable/sortable feed over the whole activity log (by action-type,
user, sort) with per-action totals. **Complexity — Logic 2 / Impl 2.** In the rebuild, Analytics
folds into Reports and Activity Log into Cross-cutting — but **Client Capacity** must be preserved.

## 23. Misc — Floating Sticky Note (8696), Journey modal (8714), Template Performance modal
(8784), Verification Presets modal (8857, `verification_preset_save/delete`), Mention Picker
(8893), Candidate Outreach modal (8910, `candidate_log_outreach`), Add Candidate modal (9338,
`ats_add_candidate`).

---

## Most complex modules — ranked (rebuild priority for care/testing)

**By Logic (algorithms/rules — where bugs hide and AI helps least):**
1. **CRM deal close-probability + contact strength + churn risk** (three interlocking Logic-5
   scorers sharing email-sentiment logic).
2. **Reports → Mass Journey** (Gantt geometry + segment replay + percentile stats).
3. **Weekly Brief anomalies/funnel/trends** (6 metrics × 3 rolling horizons, divergent defs).
4. **Sourcing + Open Roles matchers** (weighted scoring + state machines + triage/SLA).
5. **Daily Log** (tenure ramps, streaks, pacing forecast) & **Candidate Detail** (@mention
   parser + gates + cross-platform handoff) & **Rules Engine** (scoring + track-aware gates).

**By Implementation (volume/wiring/UI density):**
Bulk Import, Sourcing, Open Roles, CRM, Reports, Candidate Detail Modal, Pipeline, Daily Log,
Weekly Brief, NPPES search — all Impl-5.

---

## Cross-cutting hidden complexity (the real rebuild risks)

1. **Config stored as activity-log events** (clients, roles, CRM records) — must be modeled as
   real tables in Postgres; reconstruct once during migration.
2. **`ats_log` is an overloaded write bus** — split into typed operations per domain.
3. **Email-sentiment/response scoring reimplemented 3× in CRM** — consolidate into one shared
   server function; it feeds churn, contact strength, and deal probability.
4. **Three week definitions + duplicated overdue/promoted/stuck logic** — centralize in
   `server/rules` as single sources of truth.
5. **`UpdatedAt` overloaded** as stage-entry AND placement date — the new schema needs explicit
   `stage_entered_at` and `placed_at` (and a stage-history table) to make TTP/time-in-stage
   correct.
6. **`OutreachAttempts` as a JSON string column re-parsed everywhere** — normalize into an
   `outreach_attempts` table; index by associate/day (kills the biggest perf sink).
7. **No memoization / O(n·activity) everywhere** — server-computed aggregates + query-time math.
8. **Stage-gate asymmetry** (drag blocks, bulk bypasses) — enforce gates **server-side** on every
   transition path.
9. **Security**: client-trusted role, hardcoded admin password, unverified Google JWT,
   `dangerouslySetInnerHTML` note XSS, hidden notes shipped to browser — all fixed by the target
   architecture (server RBAC, sanitize, per-role queries).
10. **`op_add_provider` non-idempotent handoff** — needs an idempotency key in the rebuild.

---

## Full backend event catalog (~90 operations)

**Candidates/pipeline:** ats_add_candidate, ats_update_candidate, ats_move_candidate,
ats_delete_candidate, ats_restore_candidate, ats_purge_candidate, ats_park_action,
ats_verify_license, ats_log, candidate_log_outreach.
**Notes/mentions:** ats_add_note, ats_notify_mention, ats_get_mentions, ats_mark_mention_read.
**Source leads:** source_lead_add, source_lead_bulk_import, source_lead_log_outreach,
source_lead_edit_outreach, source_lead_delete_outreach, source_lead_bulk_log_outreach,
source_lead_bulk_action, source_lead_snooze, source_lead_undelete, source_lead_promote.
**Open roles:** open_role_add, open_role_update, open_role_delete, role_note_add, role_note_delete.
**Clients/CRM:** client_profile_save, client_profile_delete, client_contact_add,
client_contact_update, client_contact_delete, deal_add, deal_update, deal_close, deal_delete,
crm_email_pull, crm_ai_workspace (+ ats_log crm_* actions).
**AI/briefs/parse:** extract_resume, ats_parse_jd, daily_brief_generate, daily_brief_save,
weekly_brief_generate, weekly_brief_save, weekly_brief_patterns,
ats_overview_brief_get_or_generate, inbound_triage.
**Verification/providers:** verification_preset_save, verification_preset_delete, op_add_provider,
enrich_provider_contact.
**Targets/KPIs:** ats_targets_get, ats_targets_set, ats_targets_suggest, ats_actuals_get,
ats_actuals_save, ats_pipeline_health.
**Users/auth/admin:** add_invite, update_invite, remove_invite, resend_welcome, block_user,
unblock_user, change_password, reset_password, ats_update_profile, access_request,
approve_request, decline_request (+ ats_log assign_role/create_role).
**Portal:** portal_data, portal_request_access, portal_post_role, portal_log_view.
**Migration:** migration_prepare, migration_commit.
**NPPES:** GET `U?type=nppes` (not an event).

---

*Generated by deep-reading the full `index.html` (9,531 lines) across 9 parallel analyses,
2026-07-01.*
