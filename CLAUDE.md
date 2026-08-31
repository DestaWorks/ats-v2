# CLAUDE.md

Guidance for Claude Code (and any AI/human contributor) working in this repository.

## What this is

**DestaHealth ATS** — an Applicant Tracking System for **Desta Works**, a healthcare
staffing / recruiting operation. It manages the recruiting pipeline for clinical and
operations candidates (PMHNP, LCSW, MD, PsyD, NP, etc.) and the clients they are placed
with. The app is **live with real users and real PII**, so treat all changes as
production changes.

## Current state of the codebase (read this before touching anything)

The rebuild described below is **not a future plan** — the Wave 0–6 feature build shipped, and the
SaaS restructure on top of it is most of the way through. Phases 0–6 and 8 of
`docs/SAAS-RESTRUCTURE-PLAN.md` are done; **Phase 7 (legacy data migration) and Phase 9 (sellable)
are not started**, and the Phase 6 tenancy migrations are authored and committed but
**deliberately unapplied** until the end of the restructure (owner decision, 2026-08-29 — see the
note under Phase 5). Check the plan for phase status, and `docs/IMPLEMENTATION-PLAN.md` for the
wave-by-wave feature status, before assuming something doesn't exist yet.

- **The app is a pnpm/Turborepo monorepo** — `apps/` + `packages/`, per
  `docs/SAAS-RESTRUCTURE-PLAN.md`. There is no `src/` any more; the Phase 2 extraction moved every
  file into a package, and Phase 2.10 retired the `@/*` aliases that hid where things lived.
  - `apps/web` — Next.js (App Router) operator app. Feature UI is co-located under
    `app/(app)/<feature>/`. It **serves no API**: Phase 4.3 deleted the App Router handlers, and
    `apps/web` reads data over HTTP from `apps/api` (`lib/api/{client,server}.ts`). Exactly **two**
    App Router route handlers remain in the whole repo: the Better Auth catch-all at
    `app/api/auth/[...all]/route.ts` (the only one under `app/api`) and `app/portal/access/route.ts`,
    which trades a one-time portal token for a cookie. Both own their own transport.
  - `apps/api` — NestJS, the **only** backend HTTP surface: 49 controllers, **200 route handlers**,
    27 feature modules, and **no global prefix** (routes are served at bare paths — `client.ts`
    strips the `/api` its call sites still spell). Layered
    `controller → application → repository → prisma`; controllers are thin transport and hold no
    business rules.
  - `apps/admin` — the platform-admin console (Phase 8), HTTP-only like `apps/web`.
  - `packages/` — `domain` (zero runtime deps), `contracts` (every wire shape), `application`
    (services), `db` (**the only** Prisma importer), `auth`, `integrations`, `jobs`, `ui`, `config`.
  Real build (`pnpm build`), real tests (`vitest`, ~2.3k), typecheck + lint + format + architecture
  checks all enforced in CI on every PR.
- **The legacy app is local-only and NOT in this repo.** `legacy/` is gitignored deliberately
  (`index.html`, the original ~9,500-line React/babel-standalone monolith, and `Code.gs`, the
  Google Apps Script backend) — it is a parity reference on the dev machine, **not maintained**,
  and a fresh clone will not have it. `docs/API-CONTRACT.md` documents its ~90 `event:` operations;
  `docs/MODULE-BREAKDOWN.md` maps its modules to the new build's waves.
- **Git history is now normal**: every change is a reviewable PR-sized diff on a branch,
  merged after CI passes (the old "Add files via upload" pattern is over).
- **The feature surface is fully ported.** Every domain the cheat-sheet lists is built in this
  repo; `docs/MIGRATION-CHEATSHEET.md` is now a record of the sequence, not a live instruction.
  What has **not** happened is the data: the legacy Sheet contents have not been imported
  (Phase 7), so the running app is not yet carrying the historical records.

The remaining step is a **one-shot Sheet→Postgres ETL** at final cutover (not a live Sheet
adapter — see `docs/DECISIONS.md` D1), covered by `SAAS-RESTRUCTURE-PLAN.md` Phase 7 and
`docs/MIGRATION-GAP-ANALYSIS.md`. Coding standards for this codebase are `docs/CONVENTIONS.md`.

## Before you start any task

**Read [`docs/SAAS-RESTRUCTURE-PLAN.md`](docs/SAAS-RESTRUCTURE-PLAN.md) first. Every time.**

It is the **base document**: target architecture, the `@destaworks/*` package graph and dependency
law, the engineering standards (API contracts, DRY, logging, type safety, testing), the phased plan
with a done-when per phase, and the branching/worktree/merge process. Check which phase the work
belongs to and what that phase's done-when requires before writing anything.

**Where any other doc, convention, or general habit conflicts with the plan, the plan wins** — and
the other doc is what gets corrected. If the plan itself turns out to be wrong or over-broad, fix
the plan; do not silently follow the code instead.

## Documentation map — start here

**Precedence, highest first:** `docs/SAAS-RESTRUCTURE-PLAN.md` → `docs/DECISIONS.md` → everything
else. The plan is the base document and wins outright (see the section above). `DECISIONS.md` is
authoritative *below* it: it records the locked calls from the pre-restructure build, and where a
restructure phase has since overtaken one, the decision carries a dated note rather than being
deleted. `IMPLEMENTATION-PLAN.md` and `ESTIMATE.md` describe the Wave 0–6 rebuild, which shipped —
read them as a record of what was built, not as instructions for new work.

| Doc | Purpose |
|-----|---------|
| `docs/SAAS-RESTRUCTURE-PLAN.md` | **BASE DOCUMENT — read first, every time. Wins on conflict** |
| `docs/DECISIONS.md` | **Locked decisions + resolved review findings; authoritative below the plan** |
| `docs/PROJECT-CONTEXT.md` | **Engagement, company, product portfolio, and NDA/compliance constraints** |
| `docs/PRD.md` | Product requirements — what the system does and for whom |
| `docs/ARCHITECTURE.md` | Current architecture + target architecture |
| `docs/EDD.md` | Engineering design for the target system & migration |
| `docs/STACK-ARCHITECTURE.md` | **Locked stack + layered architecture + conventions (build reference)** |
| `docs/DATA-MODEL.md` | Entities, fields, pipeline stages, scoring rules, proposed schema |
| `docs/API-CONTRACT.md` | The ~90 Apps Script `event:` operations (de-facto API) |
| `docs/MODULE-BREAKDOWN.md` | **Deep line-level map of every module: sub-modules, complexity, gotchas** |
| `docs/CONVENTIONS.md` | Coding standards, naming, git/PR rules for the new codebase |
| `docs/ESTIMATE.md` | _Historical_ — the LOCKED 3-month plan the Wave 0–6 build ran to: 7 waves, per-module hours, conditions |
| `docs/IMPLEMENTATION-PLAN.md` | _Historical_ — the Wave 0–6 build guide: per-module tasks (schema→API→client→tests) + done-when. A record of what was built, not instructions for new work |
| `docs/MIGRATION-CHEATSHEET.md` | _Superseded_ — which app to use month by month during the rebuild. Every domain is ported; only the data import is left |
| `docs/ARCHITECTURE-PROPOSAL.md` | **The architecture decision: multi-tenant SaaS on a monorepo, with the reasoning and trade-offs** |
| `docs/MIGRATION-GAP-ANALYSIS.md` | Legacy Sheet → Postgres: migrate/derive/drop per tab + restructuring blockers |
| `docs/PRODUCT-WALKTHROUGH.md` | The product as a plain-English user journey, zero tech talk |
| `docs/USER-FLOW-SOURCE-TO-HIRE.md` | Click-by-click of the flagship flow: one candidate from found to hired |
| `docs/CLIENT-BRIEF.md` | The send-to-client rebuild brief (dated 2026-07-01 — historical) |
| `docs/WHY-MIGRATE.md` · `docs/BUSINESS-CASE-SAAS.md` | Internal risk-and-money analysis · the SaaS business case |
| `docs/SECURITY-AUDIT-APP.md` · `docs/SECURITY-AUDIT-LEGACY.md` | Security review of the new app · of the legacy app |
| `docs/design/` | Per-slice design notes written during the wave build (pre-restructure paths) |
| `docs/reviews/` | Client review correspondence |
| `docs/archive/` | _Superseded_ (kept for history) — early `PLAN.md` + `MIGRATION-PLAN.md` |

## Ground rules for contributors

1. **Security first.** This app stores PII/PHI of medical professionals (names, emails, phones,
   license numbers, NPI). Never log it, never expose it client-side, never trust the client
   for authorization. Role checks must be enforced server-side. Compliance is **binding**:
   HIPAA (where applicable) + Ethiopian Data Protection Proclamation 1321/2024.
2. **No secrets in client code (NDA-binding).** The legacy app hardcodes a backend URL and
   Google OAuth client ID in `legacy/index.html` — a known defect, not a pattern to repeat.
   Secrets live in env vars only; the **Owner holds the keys** — we build against them.
   Permissive licenses only (no GPL/LGPL/AGPL without written consent). See
   `docs/PROJECT-CONTEXT.md`.
3. **Every change is a reviewable diff.** No more whole-file uploads. Work on a branch,
   open a PR, keep commits small and described.
3b. **Branching, worktrees and merging are `docs/CONVENTIONS.md` §1 — follow it, don't improvise.**
   The short version while the restructure runs: **never work on `main`** (it equals what is
   deployed); branch from `restructure` as `<type>/p<N>-<slug>`; a hotfix goes `main` → deployed →
   **merged down to `restructure` the same day**. One worktree per concurrent line of work, and
   **verify its base commit before starting** — tooling cuts worktrees from whatever `HEAD` was.
   `.env*` never follows a worktree; **never put `DATABASE_URL` in `.env.local`**, because Next.js
   prefers it while the Prisma CLI reads only `.env`. When merging parallel branches, order by
   ascending file overlap, gate between every merge, and **re-run the boundary invariant checks
   after the last one** — branches that are each green can combine to undo one another, and no test
   will tell you.
4. **Do not expand the monolith.** New functionality goes into the monorepo packages, never into
   `legacy/index.html`. We are strangling that file, not growing it. A new backend endpoint is a
   NestJS controller in `apps/api` — **never** a route handler in `apps/web`, which 4.3 removed on
   purpose so there is one surface to secure instead of two.
5. **Preserve behavior during migration.** The legacy app is a local-only parity reference, not a
   running peer — every view is ported. When touching a ported view, match the behavior it already
   has unless a change is explicitly requested.
5b. **Running it locally needs two processes, not one.** `pnpm dev:api` (3004) *and* the web app;
   `pnpm dev` alone throws on the first data call. Ports do not line up out of the box — the
   README's "Ports" table is the fix, and it is worth reading before the first run.
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
- **Roles** (`DECISIONS.md` D3, as amended by Phase 6): a **fixed set of six** — Owner, Director,
  Manager, Screener, Associate, **Admin** (`admin` is a **role value**, not an account flag). It is
  a validated string constant, **not** a Prisma enum — the schema declares no enums at all.
  Since Phase 6 authority comes from **`Membership.role` in the active workspace**, so it is one
  role *per membership*, not per account; `User.role` still exists but authorizes nothing and is
  kept only because Better Auth's admin plugin gates its own endpoints on it. **"Leadership" is a
  capability group** (guards check capabilities like `can('viewReports')`, not hardcoded role
  lists). **Custom roles are deferred to v2.**
- **Source Leads** are a pre-pipeline sourcing stage with their own lifecycle
  (Sourced → Outreach 1/2/3 → Responded Hot/Cold → Promoted into the pipeline).

## How to verify backend assumptions

When a task depends on legacy backend behavior, the source of truth is **`legacy/Code.gs`** (the
Google Apps Script backend, gitignored — present on the dev machine, absent from a fresh clone) —
read it rather than guessing from client calls alone.
`docs/API-CONTRACT.md` documents the inferred `event:` operations as a starting map, but
`Code.gs` itself is authoritative when the two disagree. If a behavior genuinely can't be
determined from `Code.gs` (e.g. it depends on live Sheet data/state), flag the assumption and
ask rather than guessing. Whether the Apps Script authenticates/authorizes server-side is
handled as a **Wave 0 legacy security-hardening task** (`IMPLEMENTATION-PLAN.md` 0.9) — audit it
and patch the live app if it trusts the client.
