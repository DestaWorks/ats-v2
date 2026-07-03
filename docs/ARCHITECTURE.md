# Architecture — DestaHealth ATS

Two parts: **current** (what exists) and **target** (what we are migrating to). The migration
sequence lives in `docs/IMPLEMENTATION-PLAN.md` + `docs/ESTIMATE.md`; **`docs/DECISIONS.md` is
authoritative** where anything here conflicts.

---

## 1. Current architecture (as-is)

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

### Backend characteristics (inferred — source not in repo)
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

## 2. Target architecture (to-be) — summary only

> **The full, authoritative target design lives in `docs/STACK-ARCHITECTURE.md`** (stack, layers,
> folders, auth/RBAC, conventions) and the locked decisions in `docs/DECISIONS.md`. This section
> is a **one-glance summary** — do not duplicate detail here; if it conflicts with STACK, STACK
> wins.

Goal: a conventional, typed, tested full-stack web app with a real database, real auth, and
server-enforced authorization — reached **incrementally**, running beside the legacy app.

```
┌──────────────── Client (Next.js App Router + React + TS) ────────────────┐
│  • Next.js, component-per-file, code-split by route                       │
│  • Typed API client + TanStack Query; zod-validated at the boundary       │
│  • Auth via Better Auth session; NO role logic trusted client-side        │
└───────────────┬──────────────────────────────────────────────────────────┘
                │  HTTPS, JSON, authenticated (Better Auth session)
                ▼
┌──────────────── Application API (Next.js Route Handlers) ────────────────┐
│  • http → services → repositories → Prisma; zod validation, RBAC guards   │
│  • Domain services: Candidates, Leads, Pipeline, Clients, Briefs, Users   │
│  • Secrets in env vars; AI keys server-side only                          │
└───────────────┬───────────────────────────────────────────────────────────┘
                ▼
        ┌──────────────────┐     ┌──────────────────────────┐
        │  PostgreSQL      │     │  External integrations    │
        │  (Prisma + migr.)│     │  • Claude API (server)    │
        │  audit log,      │     │  • NPPES, license boards  │
        │  soft-delete     │     │  • Email send (server)    │
        └──────────────────┘     │  • Object storage (resumes)│
                                 └──────────────────────────┘
```

**Stack in one line:** Next.js (App Router) + TS · Tailwind v4 + Sonner · Route Handlers →
services → repositories → Prisma · PostgreSQL (Supabase) · Better Auth (6 fixed roles →
capability groups) · Zod · TanStack Query · Claude API (server-side) · Vercel.
→ **Full detail: `docs/STACK-ARCHITECTURE.md`. Locked decisions: `docs/DECISIONS.md`.**

**Migration** is a **one-time ETL** (no live Sheet adapter, no dual-read) — see DECISIONS D1 and
the per-wave ETL tasks in `docs/IMPLEMENTATION-PLAN.md`.

---

## 3. Component inventory (current → target mapping)

| Domain | Current location | Target home |
|--------|------------------|-------------|
| Pipeline / candidates | `App()` kanban+table views, `scoreCandidate`, `CLIENT_RULES` | `candidates` service + `pipeline` feature module |
| Sourcing leads | sourcing view, `normalizeStatus`, import/promote | `leads` service + `sourcing` module |
| Resume parsing | `parse` view, pdf.js, `extract_resume` | `parsing` service (AI server-side) |
| Briefs (daily/weekly) | brief/weekly views, `*_brief_generate` | `briefs` service |
| CRM / deals | crm view, `deal_*`, `crm_*` | `crm` module |
| Users / auth / admin | auth + admin views, invites, blocks | `auth` + `admin` modules + provider |
| Client portal | `?portal=true` branch, `portal_*` | dedicated portal app/route |
| Verification | credentials view, NPPES, board links | `verification` service |
| Audit | `ats_log` | DB audit table + middleware |

See `docs/DATA-MODEL.md` and `docs/API-CONTRACT.md` for field- and operation-level detail.
