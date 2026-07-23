# DestaHealth ATS

An Applicant Tracking System for **Desta Works**, a healthcare staffing and recruiting
operation. It runs the recruiting pipeline for clinical and operations candidates
(PMHNP, LCSW, MD, PsyD, NP, and more) and the clients they are placed with — from first
contact through sourcing, screening, client submission, interview, offer, and start date.

> **Production application.** This app is live with real users and stores PII/PHI of
> medical professionals (names, emails, phones, license numbers, NPI). Treat every change
> as a production change. See [Security & compliance](#security--compliance).

The product is **healthcare-specific** (clinical credentials, state licensure, NPI/NPPES
verification, per-client fit rules), **AI-assisted** (résumé parsing, daily/weekly briefs,
job-description parsing, inbound triage), and built for a small recruiting team with
role-based responsibilities.

---

## Status

The app is being rebuilt from a legacy single-file application onto a modern stack, and the
rebuild is **well underway** — Waves 0 through 3.5 are shipped and live on Vercel.

- **New app** — lives in [`src/`](src): Next.js (App Router) + TypeScript + Prisma +
  PostgreSQL (Supabase) + Better Auth. Real build, several hundred tests, and
  typecheck/lint/format all enforced in CI on every PR.
- **Legacy app** — moved to [`legacy/`](legacy) for reference/parity-checking only. It is
  **not maintained** and is being strangled wave by wave, not built on.

Track the current wave-by-wave status in [`docs/IMPLEMENTATION-PLAN.md`](docs/IMPLEMENTATION-PLAN.md)
before assuming a feature does or doesn't exist yet.

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
- **AI assistance** — résumé parsing, daily log/brief generation, and job-description
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
| Hosting | Vercel (production `main` · staging `staging` · per-PR previews) |
| Package manager | pnpm |

---

## Architecture

The app has two halves:

- **RSC-first client** — feature code is co-located under `app/(app)/<feature>/`. Server
  Components read data by calling services directly; client components use typed fetch helpers.
- **Layered server** — `route → service → repository → prisma`, under
  `server/{services,repositories,rules,auth,db,ai,http}`. Dependencies point **one way only**:
  a lower layer never imports an upper one.

```
src/
├── app/
│   ├── (app)/            # authenticated feature routes (pipeline, candidates,
│   │                     #   sourcing, discover, roles, dashboard, activity, …)
│   ├── (auth)/           # sign-in, request-access
│   └── api/              # route handlers
├── server/              # services · repositories · rules · auth · db · ai · http
├── components/           # shared UI (incl. ui/ primitives)
├── lib/                  # constants · rules · validation · forms · utils · api
└── generated/prisma/     # generated Prisma client (gitignored)
```

See [`docs/STACK-ARCHITECTURE.md`](docs/STACK-ARCHITECTURE.md) for the definitive
architecture and conventions.

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
#    then fill in DATABASE_URL, BETTER_AUTH_SECRET, Google OAuth, and an AI key

# 3. Generate the Prisma client and run migrations
pnpm db:generate
pnpm db:migrate

# 4. Seed baseline data (optional but recommended for local dev)
pnpm db:seed           # owner account
pnpm db:seed:clients   # clients
pnpm db:seed:rules     # client scoring rules
pnpm db:seed:demo      # demo candidates/data

# 5. Start the dev server
pnpm dev               # http://localhost:3000
```

### Environment variables

Copy [`.env.example`](.env.example) and fill it in. A **distinct set of values exists per
environment** (local · staging · production) — never share secrets across environments, and
never commit real secrets (NDA-binding).

| Variable | Purpose |
|----------|---------|
| `BETTER_AUTH_URL` | This environment's own origin |
| `BETTER_AUTH_SECRET` | Auth signing secret (`openssl rand -base64 32`) |
| `DATABASE_URL` | Supabase / Postgres connection string |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google OAuth |
| `AI_MODEL` | `provider/model` string (e.g. `anthropic/claude-opus-4-8`) |
| `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` / `GOOGLE_GENERATIVE_AI_API_KEY` | AI provider key (set whichever you use) |
| `FIELD_ENCRYPTION_KEY` | AES-256-GCM key for encrypting PHI columns at rest (optional in dev) |

---

## Scripts

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start the dev server |
| `pnpm build` | Production build |
| `pnpm start` | Serve the production build |
| `pnpm test` | Run tests (Vitest) |
| `pnpm test:watch` | Run tests in watch mode |
| `pnpm typecheck` | TypeScript type-check (`tsc --noEmit`) |
| `pnpm lint` | Lint with ESLint |
| `pnpm format` / `pnpm format:check` | Format / check formatting with Prettier |
| `pnpm db:generate` | Generate the Prisma client |
| `pnpm db:migrate` | Create/apply a dev migration |
| `pnpm db:studio` | Open Prisma Studio |
| `pnpm db:status` | Print DB/migration status |
| `pnpm db:seed*` | Seed owner / clients / rules / demo data |

---

## Testing & CI

Every PR runs the full verification suite in GitHub Actions ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)):
**generate Prisma client → typecheck → lint → test → format check.** Run the same checks
locally before opening a PR:

```bash
pnpm db:generate && pnpm typecheck && pnpm lint && pnpm test && pnpm format:check
```

---

## Deployment

Hosted on **Vercel** across three isolated environments (see `docs/DECISIONS.md` D6):

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

Start with the **live build docs** — where anything conflicts, `DECISIONS.md` wins.

| Doc | Purpose |
|-----|---------|
| [`docs/DECISIONS.md`](docs/DECISIONS.md) | **Authoritative** — locked decisions; every other doc conforms |
| [`docs/IMPLEMENTATION-PLAN.md`](docs/IMPLEMENTATION-PLAN.md) | Executable build guide — per-wave tasks and status |
| [`docs/ESTIMATE.md`](docs/ESTIMATE.md) | The 3-month, 7-wave schedule |
| [`docs/STACK-ARCHITECTURE.md`](docs/STACK-ARCHITECTURE.md) | Locked stack + layered architecture + conventions |
| [`docs/CONVENTIONS.md`](docs/CONVENTIONS.md) | Coding standards, naming, git/PR rules |
| [`docs/PRD.md`](docs/PRD.md) | Product requirements — what the system does and for whom |
| [`docs/DATA-MODEL.md`](docs/DATA-MODEL.md) | Entities, pipeline stages, scoring rules, schema |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) · [`docs/EDD.md`](docs/EDD.md) | Current + target architecture and engineering design |
| [`docs/API-CONTRACT.md`](docs/API-CONTRACT.md) · [`docs/MODULE-BREAKDOWN.md`](docs/MODULE-BREAKDOWN.md) | Legacy operations map + line-level module map |
| [`docs/MIGRATION-CHEATSHEET.md`](docs/MIGRATION-CHEATSHEET.md) | Which app (old/new) to use for which task during the rebuild |
| [`CLAUDE.md`](CLAUDE.md) | Guidance for AI/human contributors |

---

## Contributing

1. Work on a branch; open a **reviewable PR** with small, described commits (no whole-file uploads).
2. Add new functionality to `src/` — **never** expand `legacy/index.html`.
3. **Preserve behavior** when porting a legacy view unless a change is explicitly requested.
4. Keep CI green (typecheck, lint, test, format).
5. **Ask before destructive actions** (data migration, purging candidates, dropping columns).

Read [`CLAUDE.md`](CLAUDE.md) and [`docs/CONVENTIONS.md`](docs/CONVENTIONS.md) before your first PR.
