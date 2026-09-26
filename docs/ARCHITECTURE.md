# Architecture — DestaHealth ATS

Two parts: **§1 legacy** (what we came from) and **§2 the system as built**. The migration sequence
is recorded in `docs/IMPLEMENTATION-PLAN.md` + `docs/ESTIMATE.md`.
**[`docs/SAAS-RESTRUCTURE-PLAN.md`](./SAAS-RESTRUCTURE-PLAN.md) is the base document and wins**
where anything here conflicts; `docs/DECISIONS.md` is authoritative below it.

---

## 1. Legacy architecture (what we came from)

> **Not "current" any more.** This section describes the single-file Google Apps Script app the
> rebuild replaced. It is kept because parity questions still get answered from it — but the
> running system is §2, and `legacy/` is gitignored, local-only, and unmaintained.

```
┌──────────────────────── Browser ────────────────────────┐
│  index.html  (~9,500 lines, single file)                 │
│                                                          │
│  • React 18  (CDN UMD build)                             │
│  • babel-standalone  → transpiles JSX in the browser     │
│  • One App() component, ~180 useState hooks              │
│  • CSS inline in <style> + inline style objects          │
│  • localStorage/sessionStorage = session + role + cache  │
│  • pdf.js, xlsx, jszip, Google Identity (GIS) via CDN    │
└───────────────┬──────────────────────────────────────────┘
                │  fetch()  (mostly mode:"no-cors", text/plain)
                │  one hardcoded URL, body = { event: "...", ...payload }
                ▼
┌──────────── Google Apps Script Web App (NOT in this repo) ┐
│  doGet()/doPost()  → switch on event                      │
│  reads/writes ↓                                           │
└───────────────┬───────────────────────────────────────────┘
                ▼
        ┌──────────────────┐        ┌─────────────────────────┐
        │  Google Sheet(s) │        │  External services        │
        │  = the database  │        │  • LLM/AI (assumption)    │
        │  Candidates,     │        │  • NPPES / NPI registry   │
        │  Leads, Profiles,│        │  • State license boards   │
        │  Notes, Activity,│        │  • Gmail/Outlook/Yahoo    │
        │  Clients, Roles… │        │  • Google Drive (resumes) │
        └──────────────────┘        └─────────────────────────┘
```

### Frontend characteristics
- **No build pipeline.** JSX is compiled on every page load by `babel-standalone` — this is
  explicitly prototyping-only and is slow / CPU-heavy on the client.
- **One mega-component.** `App()` (starts ~line 214) holds nearly all state and views.
  View routing is a local state variable `vw` (values: `home`, `kanban`, `table`, `sourcing`,
  `crm`, `client`, `openroles`, `inbound`, `brief`, `weekly`, `kpi`, `perf`, `reports`,
  `activity`, `admin`, `profile`, `migration`, `templates`, `parse`, `discover`, `learn`).
- **Client-trusted auth/roles.** Session, user, and role live in `localStorage`; `isAdmin`
  / `isLeadership` are computed in the browser. **This is not a security boundary.**
- **Hardcoded config.** Backend URL and Google OAuth client ID are literals in the HTML.

### Backend characteristics
*(Originally inferred from client calls; `Code.gs` was later obtained and is the authority. It is
local-only and gitignored, so a fresh clone will not have it.)*
- A single Apps Script endpoint multiplexing **~90 operations** via an `event` string
  (see `docs/API-CONTRACT.md`).
- Google Sheet tabs act as tables; rows are records. No relational integrity, no migrations,
  no transactions, limited query ability, and Apps Script quota limits apply.
- `mode:"no-cors"` on writes means the client **cannot read responses** for those calls —
  fire-and-forget. Reads use `text/plain` POSTs to dodge CORS preflight.

### Consequences / risks
- **Security**: data exposure if the Apps Script does not authenticate; client-side RBAC is
  bypassable.
- **Scalability**: Google Sheets is not a database; row/quota limits will bite.
- **Maintainability**: untestable, unreviewable, single point of failure (one file).
- **No observability**: no error tracking, no audit beyond `ats_log` writes.

---

## 2. The system as built

> **"Is", not "to-be".** The monorepo, the package graph, the NestJS API, the worker, the client
> portal and the platform-admin console are built and merged to `main`. Multi-tenancy is written
> and enforced in code; its Phase 6 migrations are authored and committed but deliberately
> **unapplied to the shared database** until the end of the restructure (owner decision).
> `docs/SAAS-RESTRUCTURE-PLAN.md` is the phase-by-phase status and is the base document. The full
> stack/layer/auth detail lives in `docs/STACK-ARCHITECTURE.md`, the locked decisions in
> `docs/DECISIONS.md`. This section is a **one-glance summary** — do not duplicate detail here; if
> it conflicts with STACK, STACK wins.

Three apps, nine packages, one backend. The worker is a **second entry point of `apps/api`**
(`apps/api/src/worker.ts`) shipped as its own container, not a fourth app. `apps/web` and `apps/admin` render HTML and hold no
business logic; every rule is enforced in `apps/api` or below it.

```
┌── apps/web ──────────┐  ┌── apps/admin ────────┐  ┌── client portal ─────┐
│ Next.js App Router   │  │ platform console     │  │ apps/web /portal/*   │
│ operator UI          │  │ PLATFORM_ADMIN_      │  │ identity from the    │
│ Serves HTML only —   │  │ USER_IDS, not a role │  │ portal_token cookie, │
│ exactly 2 route      │  │ HTTP-only, like web  │  │ resolved server-side │
│ handlers repo-wide:  │  └───────────┬──────────┘  └───────────┬──────────┘
│ Better Auth catch-all│              │                         │
│ + /portal/access     │              │                         │
└───────────┬──────────┘              │                         │
            └─────────────────────────┴─────────────────────────┘
                     HTTPS + JSON, session cookie forwarded
                     (no global prefix — served at bare paths)
                                      ▼
┌──────────── apps/api — NestJS, the ONLY backend surface ──────────────────┐
│  50 controllers · 209 route handlers · 27 feature modules                  │
│  controller → application → repository → Prisma                            │
│  Guards: session · identity · tenant · capability · portal · rate-limit     │
│          + @RequireModule entitlement enforcement                          │
│  Thin transport: controllers hold no business rules. Zod pipe ← contracts  │
└───────┬──────────────────────────────────────────┬────────────────────────┘
        │                                          │
        ▼                                          ▼
┌──────────────────────┐  ┌──────────────┐  ┌──────────────────────────┐
│  PostgreSQL          │  │ worker       │  │ External integrations     │
│  Prisma + migrations │  │ apps/api/src/│  │ • LLM via the AI SDK      │
│  RLS on 39 tables    │◄─┤ worker.ts —  │  │   (provider-agnostic)     │
│  audit log,          │  │ pg-boss on   │  │ • NPPES, license boards   │
│  soft-delete         │  │ the SAME     │  │ • Email send (server)     │
└──────────────────────┘  │ Postgres     │  │ • Object storage (resumes)│
                          └──────────────┘  └──────────────────────────┘
   Redis is OPTIONAL and used for rate limiting only — never as the queue.
   Unset, the limiter is per-process: exact for one instance, and silently
   `limit x instances` once a second one exists.
```

### Authorization — two axes, ANDed

Access requires both, and they are never merged:

| | scope | question |
|---|---|---|
| **Entitlement** | the **tenant** | has this firm PAID FOR this module? |
| **Capability** | the **membership** | may THIS USER do it? |

- **Roles are tenant-owned data, not a fixed enum.** `access_roles` holds one row per role per
  tenant; the six built-ins (Owner, Director, Manager, Screener, Associate, Admin) are **templates**
  the seed clones, not the runtime answer. Two workspaces may both have a "Director" granting
  different things, so `hasCapability` takes the **viewer**, never a role name.
- `Membership.roleId` carries a **composite** foreign key `(roleId, tenantId)` → `(id, tenantId)`,
  which makes a membership holding another tenant's role *unrepresentable* rather than merely
  rejected.
- Capabilities are resolved **per request** and never cached beyond one, so a revoked permission
  cannot outlive its revocation.
- Modules derive from `Tenant.plan` via `PLAN_MODULES`. An unentitled module answers
  **402 `PLAN_UPGRADE_REQUIRED`** — an upsell, deliberately distinct from 403 "you may not".
- Tenant isolation is defence-in-depth: RLS is enabled **and forced** on 39 tables, with eight
  global models exempt by design (`User`, `Session`, `Account`, `Verification`, `ScheduleRun`,
  `Tenant`, `Membership`, `AccessRole`) — the last three because they are what *produce* a tenant
  context and so cannot be filtered by one.

### The package graph

Nine packages under a one-way dependency law, enforced in CI by `scripts/check-architecture.mjs`:

```
domain ← contracts ← db ← integrations ← auth ← application ← jobs
config (leaf)                                    ui ← domain
```

`domain` and `config` are dependency-free leaves. **`db` is the only package that imports Prisma.**
`jobs` sits *above* `application` and the edge is one-way — a service may not import `jobs`, or a
handler could enqueue itself through a cycle the graph could no longer see.

Nine `scripts/check-*.mjs` gates run on every PR — architecture, tenant-scope, RLS coverage, module
gates, the auth surface, dependency drift, raw-SQL indexes, the runtime manifest, and licence
policy — across five CI jobs (commit-messages, static, test, isolation, build).

**Stack in one line:** pnpm/Turborepo monorepo · Next.js (App Router) + TS · Tailwind v4 + Sonner ·
NestJS controllers → application services → repositories → Prisma · PostgreSQL (self-hosted)
· Better Auth with **tenant-managed roles → capability groups** · Zod · RSC + typed fetch helpers
(no client cache library) · provider-agnostic LLM via the Vercel AI SDK · pg-boss job runner ·
**one `Dockerfile`, five runtime targets** (api, worker, web, admin, migrate).
→ **Full detail: `docs/STACK-ARCHITECTURE.md`. The package graph and its CI checks:
`docs/SAAS-RESTRUCTURE-PLAN.md`. Locked decisions: `docs/DECISIONS.md`.**

**Migration** is a **one-time ETL** (no live Sheet adapter, no dual-read) — see DECISIONS D1 and
Phase 7, which has **not started**: the feature surface is fully ported, the historical data is not
yet imported.

---

## 3. Where each domain lives now

Every domain below is **built**. This table replaced a legacy→target mapping: the port is done, so
what matters is the current address.

| Domain | Legacy origin | Where it lives now |
|--------|---------------|--------------------|
| Pipeline / candidates | `App()` kanban+table, `scoreCandidate`, `CLIENT_RULES` | `apps/api` candidates module · `apps/web/app/(app)/candidates` · rules in `client_rules` (data, not code) |
| Sourcing leads | sourcing view, `normalizeStatus`, import/promote | `leads`/`sourcing` modules · `apps/web/app/(app)/sourcing` |
| Resume parsing | `parse` view, pdf.js, `extract_resume` | AI server-side via the AI SDK; keys never client-side |
| Briefs (daily/weekly) | brief/weekly views, `*_brief_generate` | `packages/jobs/src/handlers/briefs.ts`, run on the worker container |
| CRM / deals | crm view, `deal_*`, `crm_*` | `crm` module · `apps/web/app/(app)/crm` |
| Users / auth / admin | auth + admin views, invites, blocks | `packages/auth` + `tenants` module; roles in `access_roles` |
| Platform operations | *(did not exist)* | `apps/admin`, gated by `PLATFORM_ADMIN_USER_IDS` |
| Client portal | `?portal=true` branch, `portal_*` | `apps/web/app/portal/*`, identity from the `portal_token` cookie — the fix for legacy's IDOR |
| Verification | credentials view, NPPES, board links | `verification` service · `compliance` module |
| Background work | *(none — all inline)* | `packages/jobs` on pg-boss, run by `apps/api/src/worker.ts` |
| Audit | `ats_log` | tenant-scoped `activity_log` + audit writes beside each mutation |

See `docs/DATA-MODEL.md` and `docs/API-CONTRACT.md` for field- and operation-level detail.
