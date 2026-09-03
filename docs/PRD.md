# Product Requirements Document — DestaHealth ATS

**Status:** Reconstructed from the existing application (reverse-engineered).
**Owner:** Project lead (you).
**Last updated:** 2026-06-29.

> This PRD documents what the **legacy** system did, derived from `index.html`. It was the
> baseline the target system was validated against and built from. Items marked
> _(assumption)_ are inferred from client-side code.

> ## Requirements, not current state
>
> Written 2026-06-29 against the legacy monolith, which is now gitignored and local-only. Read it
> for **what the product must do and for whom** — that is still the requirement. Do **not** read
> it as a description of the running system: the §7 roadmap has largely shipped (role-based
> access is server-enforced, bulk import and NPPES discovery are built, license verification
> ships as the assisted queue of DECISIONS D4), and the integrations section still names Google
> Sign-In and Apps Script + Sheets where the app now uses Better Auth and Postgres. The
> "Out of scope / open questions" list is answered in `docs/SECURITY-AUDIT-LEGACY.md`.

## 1. Purpose & vision

DestaHealth ATS is the operating system for Desta Works' healthcare recruiting business.
It takes a candidate from first contact (sourcing) through screening, client submission,
interview, offer, and start date, while enforcing client-specific fit rules and giving
leadership visibility into pipeline health and recruiter performance.

The product's differentiators over a generic ATS:
- **Healthcare-specific**: clinical credentials, state licensure, NPI/NPPES verification,
  per-client compliance rules.
- **AI-assisted**: resume parsing, daily/weekly briefs, job-description parsing, inbound
  triage, CRM email assistance.
- **Built for a small recruiting team** with role-based responsibilities.

## 2. Users & roles

| Role | Description | Access |
|------|-------------|--------|
| **Owner** | Business owner | Everything (leadership + admin) |
| **Director** | Leadership | Leadership views |
| **Manager** | Leadership | Leadership views |
| **Screener** | Screens/qualifies candidates | Core recruiting views |
| **Associate** | General recruiter | Core recruiting views |
| **Admin** | System administration | Admin Panel, Client Portal config |

- **Leadership** (Owner/Director/Manager/Admin) unlocks: Reports, Bulk Import, Credentials, CRM,
  plus `viewAnalytics` and `viewClientDiscovery`.
- **Admin** additionally unlocks: Client Portal, Admin Panel, and the account-management
  capabilities — `manageUsers`, `manageRoles`, `manageAccessRequests`, `viewAudit`,
  `viewAllNoteTypes`, `purgeCandidate`, `deleteOpenRole`, `manageAiSettings`.
- **Clients** (external) get a **read-only Client Portal** via `?portal=true` — they see
  candidates submitted to them and can post open roles / request access.

> In the legacy app roles were hardcoded by name for some users (`BASE_ROLES`) and trusted
> from the browser. **This is done:** roles are data-driven and server-enforced, and `admin` is a
> **role value, not an account flag**. The authoritative capability map is
> `packages/domain/src/constants/roles.ts`; since Phase 6 the role that authorizes is the one on
> the user's `Membership` in the active workspace.

## 3. Core capabilities (by view)

### Recruiting pipeline (core)
- **Overview (home)** — morning brief, KPIs, pipeline summary, alerts.
- **Pipeline (kanban)** — candidates across 13 stages; drag/move, scoring badges,
  overdue/stuck/hot/needs-verify filters, saved views, bulk selection, table view.
- **Add / Edit Candidate** — full candidate record with credential, license, client, source,
  population, setting, track (Clinical/Operations), tags.
- **Parse Resume** — upload a PDF, extract structured candidate data via AI, review/edit,
  add to pipeline. Also generates a formatted resume/profile (clinical/prescriber/operations
  layouts) with print/email.

### Sourcing (pre-pipeline)
- **Sourcing** — Source Leads inventory: import (CSV/XLSX), log outreach attempts
  (Outreach 1/2/3), track responses (Hot/Cold), snooze, bulk actions, soft-delete with undo,
  and **promote** a lead into the main pipeline.
- **Discover** — NPPES (NPI registry) provider search by taxonomy/state, dedupe against
  existing records, enrich contact info, add to sourcing/ATS.
- **Open Roles** — open requisitions to fill (title, credential, state, setting, population,
  priority, rate, description); client-postable via portal.

### Communication & content
- **Templates** — email/message templates with variable fill-in, send via Gmail/Outlook/Yahoo,
  log sent messages, template performance tracking.
- **Inbound** — triage inbound messages (AI extracts candidate/intent).
- **CRM** _(leadership)_ — client relationship management, deals (update/close/delete),
  contacts, email pull, AI workspace.

### Intelligence & reporting
- **Daily Brief** — AI-generated daily briefing with priority client, shifts, watch items;
  archived; editable inputs.
- **Weekly Brief** — AI-generated weekly summary (highlights, blockers, flags, next-week
  priorities), pattern detection, archive.
- **Reports / KPI / Performance** _(leadership)_ — targets vs. actuals per associate,
  pipeline health, performance metrics.
- **Credentials (matrix)** _(leadership)_ — credential/licensure coverage and per-state
  license verification links (50-state board lookup URLs).

### Administration
- **Admin Panel** _(admin)_ — user invites, blocking/unblocking, password reset, resend
  welcome, access requests approval/decline, role notes.
- **My Profile** — avatar, profile, password change, email signature.
- **Bulk Import / Migration** _(leadership)_ — import legacy candidate data (e.g. from
  "Indrasur"), preview/inspect rows, dedupe, commit.

## 4. Key domain rules

### Pipeline stages (13)
`0 New Candidate → 1 Qualified (Pre-Screen) → 2 Initial Screening → 3 Desta Review →
4 Submitted to Client → 5 Client Interview → 6 Offer/Negotiation → 7 Offer Accepted →
8 Started (Day 1)`; terminal: `9 Not Qualified`, `10 No Response`, `11 Client Rejected`,
`12 Future Pipeline`.

### Stage SLAs (alert if stuck beyond N days)
New 3d · Qualified 2d · Initial Screening 3d · Desta Review 5d · Submitted 7d ·
Client Interview 7d · Offer 5d · Offer Accepted 3d. (`STAGE_ALERTS`)

### Track-aware stage gates (`STAGE_REQUIRED`)
- **Clinical**: needs Credential + License State to qualify; License must be **verified**
  to enter Initial Screening and **Active** to be submitted to a client.
- **Operations**: only needs contact info (email or phone).

### Candidate fit scoring (`scoreCandidate`, out of 100)
State match (30) + Credential match (30) + Population (20) + Setting (10) + License Active
(10). Produces a percentage + flags + auto-disqualification reasons (`getAutoDisqualify`).

### Client matching rules (`CLIENT_RULES`)
Each client defines allowed states, credentials, populations, settings, priority, and
auto-disqualifiers. Example — *Sterling Institute*: CT only, PMHNP/MD/DO/PsyD/PhD,
Child/Adolescent, Hybrid/Outpatient, **HIGH** priority.

### Source-lead lifecycle
`Sourced → Outreach 1 → Outreach 2 → Outreach 3 (Final) → Responded — Hot / Responded — Cold
→ Promoted` (terminal: No Response, Bad Fit, Future Collaboration).

## 5. Integrations

- **Google Sign-In (GIS)** — authentication.
- **Google Apps Script + Google Sheet** — backend + datastore.
- **NPPES / NPI Registry** — provider discovery & verification.
- **50-state medical/nursing license board lookups** — verification links (CT, NJ, NY, PA,
  FL, MA, CA, OH, TX, VA, WA, CO, AZ, MD, NC, etc.).
- **Email providers** — Gmail / Outlook / Yahoo compose links.
- **AI/LLM — provider-agnostic via the Vercel AI SDK** (Anthropic · OpenAI · Google, selected by
  the `AI_MODEL` env var), server-side only, key held by the
  Owner — resume extraction, JD parsing, daily/weekly briefs, inbound triage, CRM workspace,
  and (roadmap) resume→profile matching and "find providers like this". _(Legacy currently
  invokes the LLM inside Apps Script — confirm.)_
- **pdf.js** (resume text), **xlsx/jszip** (import/export).

## 6. Non-functional requirements (target)

- **Security/compliance**: server-side auth & RBAC; encrypted PII at rest; audit log of
  candidate changes; least-privilege access; no secrets in client.
- **Reliability**: data must survive; soft-delete with restore for candidates and leads.
- **Performance**: no in-browser transpilation; bundle < a few hundred KB; pipeline view
  responsive with thousands of candidates.
- **Maintainability**: typed, tested, modular, reviewable.
- **Auditability**: every state change (`ats_log`) recorded with actor + timestamp.

## 7. Roadmap — prioritized feature work

From the client's Engineering Projects Overview. These ran **alongside** the re-architecture
(then `docs/MIGRATION-PLAN.md`, now superseded — see `docs/SAAS-RESTRUCTURE-PLAN.md`); several
already existed in rough form in the legacy app and had to be made robust and real. **Most have
since shipped** — check `docs/IMPLEMENTATION-PLAN.md` for per-item status before treating any of
them as outstanding:

1. **Role-based access** — each member sees only what their role allows (→ server-enforced
   RBAC; legacy roles are client-trusted).
2. **Bulk importer** — migrate thousands of historical records with **resume→candidate-profile
   auto-matching** (legacy has a bulk-import view; add the matching).
3. **License verification** against state-board data (legacy has board links + NPPES). *v1 ships
   an **assisted verification queue**; fully automated per-state checks are a fast-follow — see
   `DECISIONS.md` D4.*
4. **Smarter sourcing** — "find providers like this" matching + **supply-gap analysis** (legacy
   has NPPES discover + fit scoring; extend to similarity + gap analysis).

## 8. Compliance & constraints (binding)

- **HIPAA** (where applicable) + **Ethiopian Data Protection Proclamation 1321/2024** govern
  PII/PHI handling. **No secrets in code**; the Owner holds keys. Permissive licenses only.
  See `docs/PROJECT-CONTEXT.md` for the full legal/compliance constraints.

## 9. Out of scope / open questions

- Does the Apps Script authenticate every request? **(critical — must confirm)**
- Data volume (how many candidates / leads today) — drives DB sizing & migration plan.
- Email sending: are messages actually sent server-side or only composed client-side?
