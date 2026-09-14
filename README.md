# DestaHealth ATS

An Applicant Tracking System for **Desta Works**, a healthcare staffing and recruiting
operation. It runs the recruiting pipeline for clinical and operations candidates
(PMHNP, LCSW, MD, PsyD, NP, and more) and the clients they are placed with — from first
contact through sourcing, screening, client submission, interview, offer, and start date.

> **Production application.** This app is live with real users and stores PII/PHI of
> medical professionals (names, emails, phones, license numbers, NPI). Treat every change
> as a production change. See [Security & compliance](#security--compliance).

The product is **healthcare-specific** (clinical credentials, state licensure, NPI/NPPES
verification, per-client fit rules), **AI-assisted** (resume parsing, daily/weekly briefs,
job-description parsing, inbound triage), and built for a small recruiting team with
role-based responsibilities.

---

## Status

The app was rebuilt from a legacy single-file application onto a modern stack (Waves 0–3.5, live on
Vercel), and is now most of the way through a second change: a **restructure into a monorepo with a
separate API and multi-tenancy**, running on the `restructure` branch.

- **New app** — the `apps/` + `packages/` tree below. Next.js + NestJS + TypeScript + Prisma +
  PostgreSQL (Supabase) + Better Auth. Real build, ~2.3k tests, and typecheck/lint/format plus
  architecture, auth-surface and tenant-scope checks all enforced in CI on every PR.
- **Legacy app** — kept **local-only and gitignored** (`legacy/`) as a parity reference. It is
  **not maintained**, was strangled wave by wave rather than built on, and a fresh clone will not
  have it.

[`docs/SAAS-RESTRUCTURE-PLAN.md`](docs/SAAS-RESTRUCTURE-PLAN.md) is the base document — read it
first for phase-by-phase status. [`docs/IMPLEMENTATION-PLAN.md`](docs/IMPLEMENTATION-PLAN.md)
carries the earlier wave-by-wave feature status.

---

## Features

- **Candidate pipeline** — 13 pipeline stages (`0 - New Candidate` → `8 - Started (Day 1)`
  plus terminal states), accessible drag-and-drop board, server-authoritative stage gates,
  and full stage history.
- **Candidate scoring** — ranks candidate fit per client on state / credential / population /
  setting / license (out of 100). Rules live in data (`client_rules`), not code.
- **Two tracks** — `Clinical` (needs credential + license) and `Operations` (needs only
  contact info), with different stage gates.
- **Sourcing** — a pre-pipeline lifecycle for source leads (Sourced → Outreach → Responded →
  Promoted) plus Discover/NPPES search-to-sourcing.
- **Open roles** — role matcher, triage strip, JD autofill, and promote-to-pipeline.
- **Inbound triage** — paste a reply, AI extracts the candidate, dedupes, matches to a
  client, and flags hot leads.
- **AI assistance** — resume parsing, daily log/brief generation, and job-description
  parsing, all **provider-agnostic** (Anthropic / OpenAI / Google via the Vercel AI SDK).
- **Role-based access** — a fixed six-role model (Owner, Director, Manager, Screener,
  Associate, Admin) with capability-based guards enforced server-side.
- **Auditing & activity** — every mutation writes an audit-log entry; activity feeds,
  mentions, alerts, and saved views.
- **Bulk import / migration** — a one-shot Sheet→Postgres ETL for final cutover.

---

## Tech stack

| Concern | Choice |
|---------|--------|
| Framework | Next.js (App Router) + React 19 + TypeScript |
| Styling | Tailwind CSS v4 |
| ORM / DB | Prisma + PostgreSQL (managed via Supabase) |
| Auth | Better Auth (email/password + Google OAuth) |
| AI | Vercel AI SDK — provider-agnostic (Anthropic · OpenAI · Google) |
| Validation | Zod (shared client ↔ server) |
| Forms | react-hook-form + zodResolver |
| Drag & drop | dnd-kit (accessible) |
| UI primitives | shadcn / Radix for a11y-hard primitives; Sonner for toasts |
| Testing | Vitest |
| Backend | NestJS — `apps/api`, the only HTTP API surface |
| Jobs | pg-boss on the existing Postgres — `apps/api`'s worker process |
| Monorepo | pnpm workspaces + Turborepo |
| Hosting | Containerised — one [`Dockerfile`](Dockerfile) with `api`, `worker`, `web`, `admin` and `migrate` targets, composed by [`docker-compose.yml`](docker-compose.yml). Everything runs on one host under one domain, which is what keeps the session cookie same-site |
| Package manager | pnpm |

---

## Architecture

A pnpm/Turborepo monorepo with three applications over nine packages. The API is a **separate
process**: `apps/web` renders HTML and reads everything over HTTP from `apps/api`, so there is one
path into the data and one place to prove authorization.

```
apps/
├── web/                  # Next.js operator app — HTML only, no API routes
│   └── src/app/
│       ├── (app)/        # authenticated feature routes (pipeline, candidates,
│       │                 #   sourcing, discover, roles, dashboard, activity, …)
│       ├── (auth)/       # sign-in, request-access
│       ├── portal/       # client portal (external audience); portal/access/route.ts
│       │                 #   trades a one-time token for a cookie
│       └── api/auth/     # Better Auth catch-all — the ONLY route under app/api
├── api/                  # NestJS — the only backend HTTP surface (49 controllers,
│   │                     #   200 route handlers, 27 feature modules, no global prefix)
│   └── src/modules/      # one module per domain area; controllers are thin transport
└── admin/                # platform-admin console

packages/
├── domain/               # constants · pure rules · clock · money — ZERO runtime dependencies
├── contracts/            # every request/response shape, zod-validated
├── application/          # services — business logic, framework-free
├── db/                   # repositories · Prisma · migrations — the ONLY Prisma importer
├── auth/                 # sessions · capability guards · tenant context
├── integrations/         # AI · email · storage · HTTP adapters
├── jobs/                 # pg-boss queues, workers, schedules
├── ui/                   # shared React primitives
└── config/               # env contracts + the Logger
```

**Dependencies point one way only** — everything may depend on `domain`, nothing may depend on an
app — and the rule is machine-enforced by `pnpm arch:check`, not just documented.

See [`docs/SAAS-RESTRUCTURE-PLAN.md`](docs/SAAS-RESTRUCTURE-PLAN.md) for the package graph and
phase status, and [`docs/STACK-ARCHITECTURE.md`](docs/STACK-ARCHITECTURE.md) for the conventions.

---

## Getting started

### Prerequisites

- **Node.js** ≥ 20 (see [`.nvmrc`](.nvmrc))
- **pnpm** 11 (pinned via `packageManager` in `package.json`)
- A **PostgreSQL** database (Supabase project or local Postgres)

### Setup

```bash
# 1. Install dependencies
pnpm install

# 2. Configure environment
cp .env.example .env
#    then fill in DATABASE_URL, DIRECT_URL, BETTER_AUTH_SECRET, Google OAuth, and an AI key.
#    Put DATABASE_URL in `.env`, never in `.env.local`: Next.js prefers `.env.local`
#    while the Prisma CLI reads only `.env`, so the two would disagree.

# 3. Generate the Prisma client and run migrations
pnpm db:generate
pnpm db:migrate

# 4. Seed baseline data (recommended for local dev — run in this order)
pnpm db:seed           # first Tenant + Owner account + Membership
pnpm db:seed:clients   # clients (from BASE_CLIENTS)
pnpm db:seed:rules     # client scoring rules — REQUIRES db:seed:clients first
pnpm db:seed:demo      # demo candidates, tagged `demo-*` so they can be purged

# 5. Start BOTH processes — the web app serves no data on its own
pnpm dev:api                  # NestJS API on 3004  (API_PORT, then PORT, then 3004)
pnpm dev -- --port 3003       # Next.js web, second terminal — see "Ports" below
pnpm dev:worker               # third terminal; only needed for briefs/report exports
```

`apps/web` has no API routes: every read and write goes over HTTP to `apps/api`. Running `pnpm dev`
alone gives a shell that cannot load a page — `apps/web/src/lib/api/client.ts` throws outright when
`NEXT_PUBLIC_API_URL` is unset. `API_URL` (server-rendered reads) and `NEXT_PUBLIC_API_URL`
(browser) must both point at the API, and `WEB_ORIGINS` must list the web origin or the browser's
credentialed calls are refused by CORS.

`NEXT_PUBLIC_API_URL` is also read at **build** time: `apps/web/next.config.ts` derives the CSP
`connect-src` origin from it, so a build with it unset produces a bundle whose browser calls are
CSP-blocked even if the runtime value is correct.

#### Ports — read this before your first run

The dev scripts and `.env.example` do **not** agree out of the box, and the mismatch presents as
CORS failures rather than as an obvious error:

| Process | Command | Port |
|---|---|---|
| API | `pnpm dev:api` | **3004** (`API_PORT` → `PORT` → 3004) |
| Web | `pnpm dev` | **3000** (Next default — the script passes no `--port`) |
| Web | `pnpm dev:web` | **3007** |
| Admin | `pnpm dev:admin` | **3000** — collides with `pnpm dev`; Next auto-bumps whichever starts second |

`.env.example` ships `WEB_ORIGINS="http://localhost:3003"` and `BETTER_AUTH_URL="http://localhost:3000"`,
so neither dev script matches the CORS allowlist as shipped. **Pick one web port and make all three
agree**: the project convention is **3003**, so run the web app with `pnpm dev -- --port 3003` and
set `BETTER_AUTH_URL="http://localhost:3003"` and `WEB_ORIGINS="http://localhost:3003"` in your
`.env`. If you prefer 3007 (`pnpm dev:web`), change both env values to match instead.

The **worker** (`pnpm dev:worker`) is a separate process from the API. The API only enqueues; four
jobs — `generateDailyBrief`, `generateWeeklyBrief`, `reportExport`, `migrationCommit` — never
complete without it. Everything else works with the API alone.

### Environment variables

Copy [`.env.example`](.env.example) and fill it in. A **distinct set of values exists per
environment** (local · staging · production) — never share secrets across environments, and
never commit real secrets (NDA-binding).

| Variable | Purpose |
|----------|---------|
| `BETTER_AUTH_URL` | This environment's own origin (the **web** origin, not the API's) |
| `BETTER_AUTH_SECRET` | Auth signing secret (`openssl rand -base64 32`) |
| `DATABASE_URL` | Runtime Postgres connection — Supabase **transaction** pooler (6543) |
| `DIRECT_URL` | Migrations **and** the pg-boss queue — Supabase **session** pooler (5432). The transaction pooler supports neither the prepared statements migrations need nor the `LISTEN`/`NOTIFY` session the queue holds |
| `API_URL` | Where `apps/web`'s server-rendered pages reach `apps/api`. Server-only; no default — unset throws |
| `NEXT_PUBLIC_API_URL` | Where the **browser** reaches `apps/api`. No default — unset throws; also fixes the CSP `connect-src` at build time |
| `WEB_ORIGINS` | `apps/api` only — comma-separated browser origins allowed to call it with credentials. An allowlist; never `*` |
| `API_PORT` | Port `apps/api` listens on (falls back to `PORT`, then `3004`) |
| `PLATFORM_API_URL` | Where `apps/admin` reaches the API. Server-only, deliberately not `NEXT_PUBLIC_` |
| `PLATFORM_ADMIN_USER_IDS` | Comma-separated **user ids** allowed on the `/platform/*` plane. Unset → the plane refuses everyone, including a tenant Owner |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google OAuth |
| `AI_MODEL` | `provider/model` string (e.g. `anthropic/claude-opus-4-8`) |
| `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` / `GOOGLE_GENERATIVE_AI_API_KEY` | AI provider key (set whichever you use) |
| `FIELD_ENCRYPTION_KEY` | AES-256-GCM key for encrypting PHI columns at rest (optional in dev) |

---

## Scripts

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start the web app (needs `pnpm dev:api` running too) |
| `pnpm dev:api` / `pnpm dev:worker` | Start the API / the job worker |
| `pnpm dev:admin` | Start the platform-admin console |
| `pnpm build` / `pnpm build:api` | Production build — web / API bundle |
| `pnpm start` | Serve the production build |
| `pnpm test` | Run tests (Vitest) — 214 files; excludes the isolation suite |
| `pnpm test:watch` | Run tests in watch mode |
| `pnpm test:isolation` | Tenant-isolation suite against a throwaway Postgres it provisions itself |
| `pnpm typecheck` | TypeScript type-check (web + API) |
| `pnpm lint` | Lint with ESLint |
| `pnpm format` / `pnpm format:check` | Format / check formatting with Prettier |
| `pnpm arch:check` | Enforce the package dependency law |
| `pnpm auth:check` | Prove every endpoint sits behind the right guard |
| `pnpm tenant:check` | Prove no repository method can query without a tenant |
| `pnpm rls:check` / `pnpm raw-index:check` | RLS coverage / raw-SQL indexes survive migrations |
| `pnpm deps:check` | One version per dependency across the workspace (the pnpm `catalog:`) |
| `pnpm tenant:reconcile` | Read-only: prove every row belongs to exactly one tenant |
| `pnpm setup:storage` | One-off — create the `avatars` / `resumes` S3 buckets |
| `pnpm jobs` | Inspect and retry background jobs |
| `pnpm db:generate` | Generate the Prisma client |
| `pnpm db:migrate` | Create/apply a dev migration |
| `pnpm db:studio` | Open Prisma Studio |
| `pnpm db:status` | Print DB/migration status |
| `pnpm db:seed*` | Seed owner / clients / rules / demo data |

---

## Testing & CI

Every PR runs the full verification suite in GitHub Actions ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)),
in five jobs: **Commit messages** · **Static analysis** (format, lint, typecheck, dependency-graph,
architecture, raw-SQL indexes, RLS coverage, auth-surface parity, tenant scope) · **Tests** (unit,
contract, and a check that no log call names a PII field) · **Tenant isolation** (two tenants seeded
against a throwaway Postgres, proving A cannot read B per table) · **Build** (web + the
platform-admin console).

The suite is **216 test files** — 214 run by `pnpm test`, plus the two tenant-isolation files, which
need a real Postgres and run only under `pnpm test:isolation`. Run the same checks locally before
opening a PR:

```bash
pnpm db:generate && pnpm typecheck && pnpm lint && pnpm test && pnpm format:check
pnpm deps:check && pnpm arch:check && pnpm auth:check && pnpm tenant:check
pnpm rls:check && pnpm raw-index:check
```

`pnpm test:isolation` provisions its own throwaway Postgres cluster on a loopback port and deletes
it afterwards, so it needs no configuration — but it will not run against a database you supply
unless `ISOLATION_DATABASE_URL` points at a disposable one.

---

## Deployment

Everything ships as containers on **one host, under one domain**. One [`Dockerfile`](Dockerfile)
builds five targets — `api`, `worker`, `web`, `admin` and `migrate` — from a single install and
source graph, and [`docker-compose.yml`](docker-compose.yml) runs them.

One host is a security decision as much as an operational one: the session cookie is
`SameSite=Lax`, so a browser will not send it on a cross-**site** request. Splitting the web app
and the API across two registrable domains would 401 every browser mutation, and the tempting fix
— `SameSite=None` — would remove the app's only CSRF control, since CORS plus SameSite is the
whole defence. Same-site subdomains keep both properties for free.

Deploys are dispatched manually from
[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) with the exact SHA CI passed — it
refuses a revision whose four required checks are not green, ships the **API first** and waits for
`/health`, then the web app, then tags the revision `deploy/<env>-YYYY-MM-DD-<run>` so there is an
answer to "roll back to what?". The workflow publishes each target to GHCR tagged with the SHA,
applies migrations in their own job before anything serves the new schema, and only then asks the
host to pull.

### Running the containers

**[`docs/DOCKER.md`](docs/DOCKER.md) is the step-by-step guide** — start there if Docker is not
something you use daily. The short version:

```bash
pnpm docker:migrate   # apply database changes, then exit
pnpm docker:up        # start api, worker, web, admin
pnpm docker:down      # stop them
```

`NEXT_PUBLIC_API_URL` is a **build** argument, not runtime configuration: it is inlined into the
browser bundle and fixes the CSP `connect-src` origin. It must be the URL the *browser* uses, not
the internal `http://api:3004`, and changing it means rebuilding the web image rather than
restarting it. Compose refuses to start without it.

Postgres is deliberately **not** a compose service. It holds real candidate PII, wants backups and
point-in-time recovery, and has to outlive any `docker compose down` — it is a managed database
reached over the network.

Three isolated environments (see `docs/DECISIONS.md` D6):

- **Production** — `main` branch, its own Supabase project.
- **Staging** — `staging` branch, a separate Supabase project (never touches production PII).
- **Previews** — one per PR.

Migrations and the Sheet→Postgres data migration are dry-run on staging first, then applied
to production.

---

## Security & compliance

- **Security first.** This app stores PII/PHI. Never log it, never expose it client-side,
  and never trust the client for authorization — role checks are enforced **server-side**.
- **Compliance is binding** — HIPAA (where applicable) + Ethiopian Data Protection
  Proclamation 1321/2024. Sensitive columns are encrypted at rest via `FIELD_ENCRYPTION_KEY`.
- **No secrets in client code (NDA-binding).** Secrets live in env vars only.
- **Permissive licenses only** (no GPL/LGPL/AGPL without written consent).

See [`docs/PROJECT-CONTEXT.md`](docs/PROJECT-CONTEXT.md) and
[`docs/SECURITY-AUDIT-LEGACY.md`](docs/SECURITY-AUDIT-LEGACY.md).

---

## Documentation

**Precedence, highest first:** [`docs/SAAS-RESTRUCTURE-PLAN.md`](docs/SAAS-RESTRUCTURE-PLAN.md) (the
base document — read it before any task) → [`docs/DECISIONS.md`](docs/DECISIONS.md) (locked
decisions from the pre-restructure build) → everything else. Where a doc conflicts with the plan,
**the doc is what gets corrected.**

| Doc | Purpose |
|-----|---------|
| [`docs/SAAS-RESTRUCTURE-PLAN.md`](docs/SAAS-RESTRUCTURE-PLAN.md) | **Base document** — package graph, dependency law, engineering standards, 10 phases with a done-when each |
| [`docs/ARCHITECTURE-PROPOSAL.md`](docs/ARCHITECTURE-PROPOSAL.md) | The decision behind the plan: multi-tenant SaaS on a monorepo, with the trade-offs |
| [`docs/DECISIONS.md`](docs/DECISIONS.md) | Locked decisions D1–D8; authoritative below the plan |
| [`docs/IMPLEMENTATION-PLAN.md`](docs/IMPLEMENTATION-PLAN.md) | Executable build guide — per-wave tasks and status |
| [`docs/ESTIMATE.md`](docs/ESTIMATE.md) | The 3-month, 7-wave schedule |
| [`docs/STACK-ARCHITECTURE.md`](docs/STACK-ARCHITECTURE.md) | Locked stack + layered architecture + conventions |
| [`docs/CONVENTIONS.md`](docs/CONVENTIONS.md) | Coding standards, naming, git/PR rules |
| [`docs/PRD.md`](docs/PRD.md) | Product requirements — what the system does and for whom |
| [`docs/DATA-MODEL.md`](docs/DATA-MODEL.md) | Entities, pipeline stages, scoring rules, schema |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) · [`docs/EDD.md`](docs/EDD.md) | Current + target architecture and engineering design |
| [`docs/API-CONTRACT.md`](docs/API-CONTRACT.md) · [`docs/MODULE-BREAKDOWN.md`](docs/MODULE-BREAKDOWN.md) | Legacy operations map + line-level module map |
| [`docs/MIGRATION-CHEATSHEET.md`](docs/MIGRATION-CHEATSHEET.md) | Which app (old/new) to use for which task during the rebuild — **largely historical**, see its banner |
| [`docs/MIGRATION-GAP-ANALYSIS.md`](docs/MIGRATION-GAP-ANALYSIS.md) | Legacy Sheet → Postgres: migrate/derive/drop per tab, and the blockers before any import |
| [`docs/PROJECT-CONTEXT.md`](docs/PROJECT-CONTEXT.md) | Engagement, company, portfolio, and the binding NDA/compliance constraints |
| [`docs/SECURITY-AUDIT-APP.md`](docs/SECURITY-AUDIT-APP.md) · [`docs/SECURITY-AUDIT-LEGACY.md`](docs/SECURITY-AUDIT-LEGACY.md) | Security review of the new app / of the legacy app |
| [`docs/design/`](docs/design/) · [`docs/reviews/`](docs/reviews/) | Per-slice design notes from the wave build · client review correspondence |
| [`CLAUDE.md`](CLAUDE.md) | Guidance for AI/human contributors |

---

## Contributing

1. Work on a branch; open a **reviewable PR** with small, described commits (no whole-file uploads).
   While the restructure runs, branch from `restructure`, never from `main` — see
   [`docs/CONVENTIONS.md`](docs/CONVENTIONS.md) §1.
2. Add new functionality to the monorepo packages. There is no `src/` tree any more, and a new
   backend endpoint is a **NestJS controller in `apps/api`** — never a route handler in `apps/web`.
3. **Preserve behavior** when porting a legacy view unless a change is explicitly requested.
4. Keep CI green (typecheck, lint, test, format, and the architecture/auth/tenant gates).
5. **Ask before destructive actions** (data migration, purging candidates, dropping columns).

Read [`CLAUDE.md`](CLAUDE.md) and [`docs/CONVENTIONS.md`](docs/CONVENTIONS.md) before your first PR.
