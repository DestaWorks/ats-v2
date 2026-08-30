# CLAUDE.md

Guidance for Claude Code (and any AI/human contributor) working in this repository.

## What this is

**DestaHealth ATS** — an Applicant Tracking System for **Desta Works**, a healthcare
staffing / recruiting operation. It manages the recruiting pipeline for clinical and
operations candidates (PMHNP, LCSW, MD, PsyD, NP, etc.) and the clients they are placed
with. The app is **live with real users and real PII**, so treat all changes as
production changes.

## Current state of the codebase (read this before touching anything)

The rebuild described below is **well underway, not a future plan** — Waves 0 through 3.5 are
shipped and live on Vercel with real users. Check `docs/IMPLEMENTATION-PLAN.md` for the
current wave-by-wave status (✅ done / 🟡 partial / not started) before assuming a feature
doesn't exist yet.

- **The app is a pnpm/Turborepo monorepo** — `apps/` + `packages/`, per
  `docs/SAAS-RESTRUCTURE-PLAN.md`. There is no `src/` any more; the Phase 2 extraction moved every
  file into a package, and Phase 2.10 retired the `@/*` aliases that hid where things lived.
  - `apps/web` — Next.js (App Router) operator app. Feature UI is co-located under
    `app/(app)/<feature>/`. It **serves no API**: Phase 4.3 deleted the App Router handlers, and
    `apps/web` reads data over HTTP from `apps/api` (`lib/api/{client,server}.ts`). The only route
    left under `app/api` is the Better Auth catch-all, which owns its own transport.
  - `apps/api` — NestJS, the **only** backend HTTP surface (200 endpoints). Layered
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
- Some legacy domains (anything not yet ported per `IMPLEMENTATION-PLAN.md`) are still served
  by the Apps Script backend during the migration — see `docs/MIGRATION-CHEATSHEET.md` for
  which app to use for which task, month by month.

We are migrating to this stack over a 3-month plan, with a **one-shot Sheet→Postgres ETL** at
final cutover (not a live Sheet adapter — see `docs/DECISIONS.md` D1). The live build plan is
`docs/IMPLEMENTATION-PLAN.md` + `docs/ESTIMATE.md`; `docs/DECISIONS.md` is authoritative;
coding standards for the new codebase are `docs/CONVENTIONS.md`.

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
| `docs/ARCHITECTURE-PROPOSAL.md` | **The architecture decision: multi-tenant SaaS on a monorepo, with the reasoning and trade-offs** |
| `docs/SAAS-RESTRUCTURE-PLAN.md` | **LIVE — the executable restructure + multi-tenancy plan: 10 phases, standards, target structure** |
| `docs/MIGRATION-GAP-ANALYSIS.md` | Legacy Sheet → Postgres: migrate/derive/drop per tab + restructuring blockers |
| `docs/archive/` | _Superseded_ (kept for history) — early `PLAN.md` + `MIGRATION-PLAN.md`; the live plan is DECISIONS + IMPLEMENTATION-PLAN + ESTIMATE |

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

When a task depends on legacy backend behavior, the source of truth is **`legacy/Code.gs`** (the
Google Apps Script backend, gitignored — present on the dev machine, absent from a fresh clone) —
read it rather than guessing from client calls alone.
`docs/API-CONTRACT.md` documents the inferred `event:` operations as a starting map, but
`Code.gs` itself is authoritative when the two disagree. If a behavior genuinely can't be
determined from `Code.gs` (e.g. it depends on live Sheet data/state), flag the assumption and
ask rather than guessing. Whether the Apps Script authenticates/authorizes server-side is
handled as a **Wave 0 legacy security-hardening task** (`IMPLEMENTATION-PLAN.md` 0.9) — audit it
and patch the live app if it trusts the client.
