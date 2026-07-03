# Project Plan — DestaHealth ATS Rebuild

> **⚠️ SUPERSEDED — kept for history.** The live plan is **`docs/IMPLEMENTATION-PLAN.md`**
> (tasks) + **`docs/ESTIMATE.md`** (schedule), governed by **`docs/DECISIONS.md`** (authoritative).
> The M0–M6 milestones and the strangler-fig/anti-corruption-layer framing below are retired
> (per DECISIONS **D1**, migration is a one-time ETL, not a live Sheet adapter). Read for
> historical context only; do not build from it.

The sequenced delivery plan. It interleaves the **platform re-architecture** (strangler-fig,
`MIGRATION-PLAN.md`) with the **product roadmap** (`PROJECT-CONTEXT.md`), maps both to the
90-day onboarding windows, and gives each milestone concrete deliverables and acceptance
criteria. Detail lives in the linked docs; this is the spine.

> Cadence assumption: solo engineer, ~full-time, weekly check-in with Biruh. Durations are
> estimates to adjust together in week one — Biruh sets product priority; sequencing is a
> joint call. Honesty over good news: if a milestone slips, it gets flagged early.

---

## North star

Take the ATS from a single-file prototype (in-browser Babel + Apps Script + Google Sheets,
client-trusted auth) to a **typed, tested, modular Next.js app on PostgreSQL with
server-enforced RBAC** — **without downtime**, porting view-by-view — while delivering the
four roadmap features along the way. Every step satisfies a binding constraint: real version
control, no secrets in code, permissive licenses, HIPAA + Ethiopian Proclamation 1321/2024.

## Two tracks, interleaved

- **Track A — Platform:** baseline → new app skeleton → data layer → port views → decommission.
- **Track B — Product:** ① RBAC ② bulk importer + résumé matching ③ automated license
  verification ④ smarter sourcing (similarity + supply-gap).

They are not separate projects. RBAC (B①) is delivered *as* the auth layer. The bulk importer
(B②) *is* the Sheet→Postgres migration tool. Verification (B③) and sourcing (B④) ride on top
of the ported pipeline. The plan sequences them so each milestone ships something usable.

---

## Milestones

### M0 — Baseline & security triage  *(Phase 0 · ~week 1 · "First 30")*
**Goal:** professional foundation; stop any bleeding.
- Real `index.html` committed as baseline; branch protection + PR review on `main`.
- Obtain the Apps Script (`Code.gs`) source; **audit whether it authenticates/authorizes
  server-side.** If it trusts the client → add a server-side token + role checks immediately.
- Secrets inventory (hardcoded backend URL, OAuth client id) + rotation plan; SBOM/license
  scaffold + CI license check.
- Docs suite ratified as source of truth.

**Done when:** baseline + review process live; backend security posture *known* and worst holes
closed; no secrets added; license policy enforced in CI.

### M1 — New app skeleton + auth/RBAC  *(Phase 1 + Product B① · ~weeks 2–3)*
**Goal:** a real, deployable app shell with working, server-enforced auth — the **B① roadmap
feature** lands here.
- Scaffold: Next.js + TS + Tailwind v4 + Sonner + ESLint/Prettier + Vitest + CI; the layered
  folder structure from `STACK-ARCHITECTURE.md`; lint rules for layer boundaries.
- Supabase Postgres + Prisma; first migration (users + auth models).
- **Better Auth** (email/password + Google) on Supabase Postgres; `role` as a DB column;
  `requireUser`/`requireRole`/`requireLeadership` guards; protected route shell + sidebar
  gating server-side.
- Anti-corruption layer skeleton: a typed API that can read the legacy Sheet via an adapter.

**Done when:** users sign in via the new app; role is server-enforced (provably un-bypassable
from devtools); CI green; deployed to a Vercel preview.

### M2 — Data model + bulk importer/migration  *(Phase 2 + Product B② · ~weeks 3–5)*
**Goal:** Postgres becomes the source of truth; the **B② importer** is the migration vehicle.
- Finalize Postgres schema (`DATA-MODEL.md`): candidates, leads, notes/mentions, clients,
  open roles, deals, briefs, targets/actuals, activity_log; enums, soft-delete, audit columns.
- Build the **bulk importer**: idempotent Sheet→Postgres import (normalize statuses, expand
  outreach JSON, map roles, dedupe) with an added/skipped/errored report — usable as a
  product feature for ongoing historical-record imports.
- **Résumé→profile auto-matching** (B②): parse résumé (Claude API, server-side) and match to /
  create candidate profiles during import.
- Dual-read parity check; flip the ACL from Sheet-adapter to Postgres repositories.

**Done when:** historical records imported and verified against the Sheet; résumé matching
works on a real batch; API serves Postgres; Sheet is read-only legacy.

### M3 — Port the core pipeline  *(Phase 3 start · ~weeks 5–8 · "By 60")*
**Goal:** the highest-value view runs on the new stack end-to-end.
- Port the **rules engine** (`scoring`, `disqualify`, `stage-gates`, `client-rules`) into pure,
  unit-tested `server/rules` — now **server-authoritative**.
- Port **Pipeline (kanban + table)** + **Add/Edit Candidate** + **Notes/Mentions**: move,
  stage-gate enforcement, scoring badges, filters, saved views, audit on every change.
- E2E tests for the critical flows; enable for a subset, then all; delete the legacy pipeline
  code from `index.html`.

**Done when:** recruiters work the pipeline entirely in the new app; legacy pipeline removed;
stage transitions enforced server-side; "By 60" = one project owned end-to-end + review norms
in place.

### M4 — Sourcing + license verification  *(Phase 3 + Product B③ · ~weeks 8–11)*
**Goal:** port sourcing and ship automated verification.
- Port **Sourcing** (leads, outreach log, promote, bulk actions) and **Discover (NPPES)**.
- **Automated license verification (B③):** verify against state-board data and set
  `LicenseStatus` automatically, feeding the stage gates (clinical track needs Active license
  to submit). Keep the per-state board links as fallback.

**Done when:** sourcing runs on the new stack; license status is set automatically for
supported states with an audit trail; manual fallback documented.

### M5 — Smarter sourcing + remaining views  *(Phase 3 + Product B④ · ~weeks 11–14 · "By 90")*
**Goal:** the differentiating feature + finish porting.
- **Smarter sourcing (B④):** "find providers like this" similarity matching + **supply-gap
  analysis** (open roles vs. available candidates by credential/state).
- Port remaining views: Briefs (daily/weekly), Templates, Inbound, CRM/Deals, Open Roles,
  Reports/KPI, Admin, Profile. AI features move to server-side Claude endpoints.

**Done when:** all recruiting + intelligence views on the new stack; smarter-sourcing live;
"By 90" = leading a meaningful build and go-to for the ATS.

### M6 — Decommission + harden  *(Phase 4 · after porting)*
- Migrate résumé files to object storage with signed expiring URLs.
- Retire the Apps Script + Sheet; rotate exposed credentials.
- Delete legacy `index.html`. Finalize observability (error tracking, structured logs) and the
  audit log. Complete the compliance checklist (HIPAA + Proclamation 1321/2024).

**Done when:** single typed/tested codebase; no Sheets, no in-browser Babel, no client-trusted
auth; compliance checklist signed off.

---

## 90-day mapping

| Window | Plan | Onboarding-doc intent |
|--------|------|----------------------|
| First 30 | M0 + M1 (skeleton, auth/RBAC) | Ramp, access set up, one visible win (auth shell) |
| By 60 | M2 + M3 (data layer, core pipeline ported) | Own one build end-to-end; set review norms |
| By 90 | M4 + M5 (sourcing, verification, smarter sourcing) | Lead something that matters; go-to for the ATS |
| Beyond | M6 decommission; then EMR / Ethio-TeleHealth horizon | Long-term platform ownership |

---

## Immediate backlog (M0 → early M1) — task granularity

1. [ ] Commit current `index.html` as the clean baseline; write a one-line README on "legacy".
2. [ ] Enable branch protection + required PR review + status checks on `main`.
3. [ ] Ask Biruh for: Apps Script source, Claude API key, Supabase project, Vercel access,
       Google OAuth credentials (Owner-held). *(see "Asks" below)*
4. [ ] Security audit of the Apps Script; document findings; close critical holes if any.
5. [ ] `pnpm` Next.js + TS scaffold; Tailwind v4; Sonner; ESLint/Prettier; Vitest; CI workflow.
6. [ ] Layered folder structure + `eslint-local-rules` boundary rules + `server-only` guards.
7. [ ] CI license check + initial SBOM (`docs/THIRD-PARTY-LICENSES.md`).
8. [ ] Supabase Postgres + Prisma init; `prisma.config.ts`; first migration.
9. [ ] Better Auth wiring (`auth.ts`, `[...all]` route, `auth-client.ts`, guards); auth e2e test.
10. [ ] `.env.example` (no secrets); document local setup in repo README.

---

## Decisions (settled)

- **Sequencing:** engineer assigned to the **ATS** (this repo).
- **Auth layer:** **Better Auth on Supabase Postgres** — Supabase as managed Postgres only;
  Better Auth for auth/RBAC. (Engineer's technical call; share with Owner, don't block on it.)
- **Stack:** locked in `docs/STACK-ARCHITECTURE.md`.

## Dependencies — to raise with Biruh later (not now)

We'll plan against these as assumptions and bring them up when we share the plan / before the
relevant milestone. **Holding the access-keys conversation for now.**

- **Access/keys (Owner-held, needed by M1 build):** Apps Script project + `Code.gs`, Supabase,
  Vercel, Claude API key, Google OAuth client. Engineer builds against them (env secrets);
  never holds raw keys.
- **Data (needed by M2):** export of / read access to the current Sheet; a sample of historical
  résumé records for the importer + matching.
- **Info (quick answers):** rough candidate/lead volume; whether email is sent server-side.
- **Confirm:** milestone cadence in the week-one sync.

## Decision gates (block the milestone after them, not the whole plan)

- **G1 (before M2 cutover):** data-migration parity verified; Owner sign-off to make Postgres
  the source of truth.
- **G2 (before each view goes live in M3–M5):** QA parity vs legacy; subset → all rollout.
- **G3 (before M6):** Owner sign-off to retire the Sheet/Apps Script and rotate credentials.

## Risks

Carried from `MIGRATION-PLAN.md` (unauthenticated backend, data loss, behavior drift, scope
creep, Sheet limits, single-person knowledge). Top mitigations: M0 security audit first;
idempotent imports + dual-read parity (G2); preserve-behavior + QA per view (G3); docs + tests
encode knowledge.

## How we track

- Every change is a small PR with a description; weekly written status (done / stuck / needs)
  before the face-to-face; this plan + `MIGRATION-PLAN.md` checklists kept current.
