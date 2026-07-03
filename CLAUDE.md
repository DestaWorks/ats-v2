# CLAUDE.md

Guidance for Claude Code (and any AI/human contributor) working in this repository.

## What this is

**DestaHealth ATS** — an Applicant Tracking System for **Desta Works**, a healthcare
staffing / recruiting operation. It manages the recruiting pipeline for clinical and
operations candidates (PMHNP, LCSW, MD, PsyD, NP, etc.) and the clients they are placed
with. The app is **live with real users and real PII**, so treat all changes as
production changes.

## Current state of the codebase (read this before touching anything)

- The **entire application today is a single file**: `index.html` (~9,500 lines, ~860 KB).
- It is **React 18 written as JSX, transpiled in the browser by `babel-standalone`** at
  page load. There is **no build step, no `package.json`, no `src/`, no tests**.
- The **backend is a Google Apps Script web app** (a Google Sheet acting as the database),
  reached at one hardcoded URL in `index.html`. We do **not** have the Apps Script source
  in this repo — its behavior is inferred from client calls (see `docs/API-CONTRACT.md`).
- Git history is currently a series of "Add files via upload / Delete index.html" commits.
  There is **no meaningful diff history and no baseline**. We are establishing one now.

This architecture is a prototype that outgrew itself. We are migrating to a professional
stack (Next.js · Prisma · Postgres · Better Auth) over a 3-month plan, with a **one-shot
Sheet→Postgres ETL** at cutover (not a live Sheet adapter — see `docs/DECISIONS.md` D1). The
live build plan is `docs/IMPLEMENTATION-PLAN.md` + `docs/ESTIMATE.md`; `docs/DECISIONS.md` is
authoritative.

## Documentation map — start here

The **live build docs** are `docs/DECISIONS.md` (authoritative decisions), `docs/IMPLEMENTATION-PLAN.md`
(tasks), and `docs/ESTIMATE.md` (schedule). Where anything conflicts, **DECISIONS.md wins.**

| Doc | Purpose |
|-----|---------|
| `docs/DECISIONS.md` | **AUTHORITATIVE — locked decisions + resolved review findings; every other doc conforms** |
| `docs/PROJECT-CONTEXT.md` | **Engagement, company, product portfolio, and NDA/compliance constraints** |
| `docs/PRD.md` | Product requirements — what the system does and for whom |
| `docs/ARCHITECTURE.md` | Current architecture + target architecture |
| `docs/EDD.md` | Engineering design for the target system & migration |
| `docs/STACK-ARCHITECTURE.md` | **Locked stack + layered architecture + conventions (build reference)** |
| `docs/DATA-MODEL.md` | Entities, fields, pipeline stages, scoring rules, proposed schema |
| `docs/API-CONTRACT.md` | The ~90 Apps Script `event:` operations (de-facto API) |
| `docs/MODULE-BREAKDOWN.md` | **Deep line-level map of every module: sub-modules, complexity, gotchas** |
| `docs/CONVENTIONS.md` | Coding standards, naming, git/PR rules for the new codebase |
| `docs/ESTIMATE.md` | **LIVE — LOCKED 3-month plan: 7 waves, per-module hours, month-by-month, conditions** |
| `docs/IMPLEMENTATION-PLAN.md` | **LIVE — executable build guide: per-module tasks (schema→API→client→tests) + done-when** |
| `docs/MIGRATION-CHEATSHEET.md` | **End-user: which app (old/new) to use for which task, month by month, during the rebuild** |
| `docs/archive/` | _Superseded_ (kept for history) — early `PLAN.md` + `MIGRATION-PLAN.md`; the live plan is DECISIONS + IMPLEMENTATION-PLAN + ESTIMATE |

## Ground rules for contributors

1. **Security first.** This app stores PII/PHI of medical professionals (names, emails, phones,
   license numbers, NPI). Never log it, never expose it client-side, never trust the client
   for authorization. Role checks must be enforced server-side. Compliance is **binding**:
   HIPAA (where applicable) + Ethiopian Data Protection Proclamation 1321/2024.
2. **No secrets in client code (NDA-binding).** The current app hardcodes a backend URL and
   Google OAuth client ID in `index.html`. Do not add more. Secrets live in env vars only; the
   **Owner holds the keys** — we build against them. Permissive licenses only (no GPL/LGPL/AGPL
   without written consent). See `docs/PROJECT-CONTEXT.md`.
3. **Every change is a reviewable diff.** No more whole-file uploads. Work on a branch,
   open a PR, keep commits small and described.
4. **Do not expand the monolith.** New functionality goes into the new project structure
   (once it exists), not into `index.html`. We are shrinking that file, not growing it.
5. **Preserve behavior during migration.** The legacy app and the new app run side by side.
   When porting a view, match existing behavior unless a change is explicitly requested.
6. **Ask before destructive actions** (data migration, deleting sheet columns, purging
   candidates). The `ats_purge_candidate` / soft-delete semantics matter — see DATA-MODEL.

## Key domain facts (so you don't have to re-derive them)

- **13 pipeline stages**, `0 - New Candidate` → `8 - Started (Day 1)` plus terminal states
  (Not Qualified, No Response, Client Rejected, Future Pipeline). In the **target**, status is a
  stable **code + `stage_order` ordinal** (not the label string) — scoring/gates/funnels key off
  the code. See `DATA-MODEL.md`.
- **Candidate scoring** (`scoreCandidate`) ranks fit per client on state / credential /
  population / setting / license, out of 100. In the target the rules live in a **`client_rules`
  table** (data, not code) and `scoreCandidate(candidate, clientRules)` takes them as an argument.
- **Two tracks**: `Clinical` (default, needs credential + license) and `Operations`
  (needs only contact info). Stage gates differ — see `STAGE_REQUIRED` (server-authoritative).
- **Roles** (target model, `DECISIONS.md` D3): a **fixed enum** — Owner, Director, Manager,
  Screener, Associate, **Admin** (`admin` is a **role value**, not an account flag; one role per
  account). **"Leadership" is a capability group** (guards check capabilities like
  `can('viewReports')`, not hardcoded role lists). **Custom roles are deferred to v2.**
- **Source Leads** are a pre-pipeline sourcing stage with their own lifecycle
  (Sourced → Outreach 1/2/3 → Responded Hot/Cold → Promoted into the pipeline).

## How to verify backend assumptions

When a task depends on legacy backend behavior, the source of truth is the Google Apps Script,
**not** this repo. Flag the assumption and ask for the `Code.gs` source rather than guessing.
Whether the Apps Script authenticates/authorizes server-side is handled as a **Wave 0 legacy
security-hardening task** (`IMPLEMENTATION-PLAN.md` 0.9) — audit it and patch the live app if it
trusts the client.
