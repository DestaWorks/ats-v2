# Engineering Design Document — DestaHealth ATS (Target System)

**Status:** Draft for review. **`docs/DECISIONS.md` is authoritative** where this conflicts.
**Context:** Live app, real users, real PII. Decision on record: **proper backend + DB**,
sequenced as **"security now, refactor steady"** with a phased cutover and a **one-time
Sheet→Postgres ETL** (no live Sheet adapter, no dual-read — see DECISIONS D1). Sequencing lives
in `docs/IMPLEMENTATION-PLAN.md` + `docs/ESTIMATE.md`.

> **Stack is now locked** (Next.js · Prisma · PostgreSQL · Better Auth · Zod · Tailwind v4 ·
> Sonner · TanStack Query) and the layered architecture is fully specified in
> **`docs/STACK-ARCHITECTURE.md`** — read that for folder structure, layer rules, auth setup,
> and conventions. The stack notes in §2 below are kept for rationale/history.

---

## 1. Goals & non-goals

### Goals
- Eliminate client-trusted authentication/authorization; enforce RBAC server-side.
- Move off Google Sheets to a real relational database with migrations and audit.
- Replace the in-browser-Babel monolith with a typed, tested, modular codebase.
- Keep the product running and shipping throughout (port view-by-view).
- Make PII handling defensible (encryption, least privilege, audit).

### Non-goals (for v1 of the migration)
- Redesigning the product/UX (we preserve behavior; redesign is a later, separate effort).
- New features unrelated to the migration.
- Multi-tenant SaaS generalization (single-org for now).

---

## 2. Design decisions (with rationale)

### 2.1 Migration strategy — phased cutover + one-time ETL
**Decision (DECISIONS D1/D2):** Stand up the new Next.js app beside the legacy `index.html`
and cut over domain-by-domain. Each entity is migrated by a **one-shot extract → transform →
load** into Postgres, with a short read-only freeze / delta re-sync at final cutover. We do
**not** build an anti-corruption layer that reads the Sheet live, and there is **no dual-read
window.** The sourcing + pipeline funnel cuts over together (D2) so there's no window where
legacy promote writes a candidate the new pipeline can't see.
**Why:** The app is live daily; a big-bang rewrite risks a long blackout, but a live Sheet
adapter adds throwaway complexity and split-brain risk. A clean per-domain ETL with a freeze is
simpler and safer.
**Trade-off:** Short read-only freezes at cutover; until a domain is ported its legacy writes
are frozen/redirected (not dual-run).

### 2.2 Frontend — Next.js + React + TypeScript
**Decision:** **Next.js (App Router)** + React + TypeScript, component-per-file. (Stack locked —
see `docs/STACK-ARCHITECTURE.md`.)
**Why:** Preserves the existing React mental model and most UI logic while removing
in-browser transpilation, adding types, tests, and code-splitting; single full-stack app.
**Alternatives considered:** Stay on babel-standalone (rejected — production-forbidden, no
types/tests). Separate SPA build (rejected — needless churn; Next.js full-stack is the lock).

### 2.3 Backend — Next.js Route Handlers (full-stack)
**Decision:** **Next.js Route Handlers** as the API layer → `http → services → repositories →
Prisma` (layered, per STACK-ARCHITECTURE). Single full-stack app; no separate API service.
**Why:** Same language across the stack, strong typing end-to-end, large ecosystem,
straightforward Claude API and Postgres integration, and best velocity for a solo build.

### 2.4 Database — PostgreSQL + Prisma
**Decision:** PostgreSQL with Prisma ORM (migrations + type-safe queries).
**Why:** Relational integrity, enums, transactions, real querying, soft-delete + audit —
none of which Sheets provides. Prisma gives migrations and generated types.
**Trade-off:** Operational ownership of a DB (mitigated by a managed Postgres).

### 2.5 Auth & RBAC — Better Auth, server-enforced
**Decision:** **Better Auth** (Prisma adapter) for identity — email/password + Google
Sign-In — with **authorization enforced in server guards** against a DB-stored `role` column.
See `docs/STACK-ARCHITECTURE.md` §4 for the concrete setup and `requireUser`/`requireRole`
guards.
**Why:** The current model trusts the browser for role — anyone can become admin in devtools.
**RBAC = 6 fixed roles** (`Owner, Director, Manager, Screener, Associate, Admin`) mapped to
**capability groups** — guards check capabilities (`can('viewReports')`), not a hardcoded
"leadership" role list; `admin` is a **role value**, not a boolean flag; **custom roles are v2**
(DECISIONS D3). Roles are data-driven and checked server-side on every request.

### 2.6 Validation & contracts — zod at every boundary
Every API input validated with `zod`; types shared client↔server. No silent coercion.

### 2.7 AI — server-side only
All LLM calls (resume extraction, briefs, JD parse, inbound triage, CRM workspace) move
behind the API with a **server-held key**. Define typed request/response schemas and
validate model output. (Provider/model: confirm what the Apps Script uses today; default to
the latest Claude models for new work.)

### 2.8 Secrets & config
No secrets in client code. Backend URL, OAuth IDs, DB URL, AI keys → environment variables.
Separate config per environment (local/staging/prod).

### 2.9 Environments & domains (DECISIONS D6)
Three isolated environments: **production `zyx.com`** (`main` branch, Supabase `desta-ats-prod`),
**staging `staging.zyx.com`** (`staging` branch, Supabase `desta-ats-staging`), plus per-PR Vercel
previews and local. Staging and production use **two separate Supabase projects** — staging never
touches production PII. Secrets, `BETTER_AUTH_URL`, and Google OAuth redirect URIs are
per-environment/per-domain. **Migrations and the Sheet→Postgres data migration are rehearsed on
staging first, then applied to production** — this is a primary de-risk for the data migration.
Setup detail in `IMPLEMENTATION-PLAN.md` 0.1b. (`zyx.com` is a placeholder for the real domain.)

---

## 3. System components

| Component | Responsibility |
|-----------|----------------|
| Web client (SPA/Next) | UI, typed API client, auth session |
| API layer | Routing, validation, authZ, orchestration |
| Domain services | Candidates, Leads, Pipeline rules, Clients, Briefs, Verification, Users, CRM |
| Persistence | Postgres repositories (Prisma). No live Sheet adapter — migration is a one-time ETL (D1) |
| Integrations | LLM, NPPES, license boards, email send, object storage |
| Audit/observability | activity_log table, error tracking, structured logs |

**Pipeline rules engine** (`scoreCandidate`, `getAutoDisqualify`, `STAGE_REQUIRED`,
`STAGE_ALERTS`, `CLIENT_RULES`) becomes a **shared, server-authoritative module** — today
it is advisory client code; in the target it must gate stage transitions on the server.

---

## 4. Data migration plan (Sheet → Postgres)

This is a **one-time ETL per entity** (DECISIONS D1) — no live Sheet adapter, no dual-read.

1. **Schema** from `docs/DATA-MODEL.md`; enforce enums + soft-delete + audit columns. Status is
   stored as **stable codes + `stage_order` ordinal** (not labels).
2. **Extract** current Sheet data (export/CSV or Apps Script dump).
3. **Transform**: normalize statuses to codes (`normalizeStatus`), split `OutreachAttempts` JSON
   into `outreach_attempts` rows, map hardcoded roles → `users.role`, **email-primary dedupe**
   (name as secondary/manual-review), each row carrying a `legacy_id` for idempotent upsert.
4. **Load** into Postgres; verify row counts and spot-check against golden-file expectations.
5. **Cutover**: at final backfill the Sheet goes **read-only (freeze)**, a delta re-sync catches
   last-minute writes, then Postgres is the source of truth and the Sheet is retired.

Migration scripts are idempotent and re-runnable; every run produces a report
(added/skipped/errored) — mirroring the existing bulk-import UX.

---

## 5. Security design (priority)

- **AuthN**: provider-issued session/JWT; httpOnly cookies; no role in client storage.
- **AuthZ**: middleware maps user→role→permitted operations; every event-equivalent route
  guarded. Leadership/admin gates enforced server-side, not via UI hiding.
- **PII**: encrypt at rest; restrict columns (license #, NPI) by role; never log PII; TLS in
  transit; signed, expiring URLs for resume files.
- **Audit**: immutable `activity_log` for every state change (actor, before/after, time).
- **Input**: zod validation; parameterized queries via Prisma (no injection).
- **Secrets**: env vars + secret manager; rotate the currently-exposed Apps Script URL and
  OAuth client usage as part of cutover.

---

## 6. Testing strategy

- **Unit**: rules engine (scoring, disqualify, stage gates), transforms (`normalizeStatus`).
- **Integration**: API routes against a test Postgres (per-operation, authz cases).
- **E2E**: critical flows — sign-in, add candidate, move stage, promote lead, parse resume.
- **Migration tests**: golden-file import → expected rows.
- **CI**: lint + typecheck + tests on every PR; no merge on red.

---

## 7. Rollout & cutover (per view)

For each ported view: build behind the new app → QA against legacy → enable for a subset →
enable for all → remove the legacy view's code from `index.html`. **Pipeline (kanban) first**
(highest-value, exercises candidates + rules + audit). Briefs/CRM later. Client portal last
(separate audience). Legacy file is deleted when empty.

---

## 8. Open questions

**Resolved by the client onboarding docs (see `docs/PROJECT-CONTEXT.md`):**
- ✅ **AI provider/model:** Claude API (Anthropic), server-side key held by the Owner.
- ✅ **Compliance regime:** US HIPAA (where applicable) + Ethiopian Data Protection
  Proclamation 1321/2024.
- ✅ **Hosting / managed Postgres:** Vercel + Supabase (Postgres).
- ✅ **Secrets ownership:** the Owner holds all keys; we build against env vars.
- ✅ **Auth layer:** **Better Auth on Supabase Postgres** (decided — Supabase as managed
  Postgres only; Better Auth for auth/RBAC). To be shared with the Owner, not blocked on him.

**Still to resolve (not blocking the plan):**
1. Does the Apps Script authenticate & authorize today? (Drives urgency of Phase 0.)
2. Data volume (candidates/leads) → DB sizing + migration runtime.
3. Is email actually sent server-side, or only composed (mailto/compose links)?

_(Resolved: ATS sequencing settled; auth layer decided — Better Auth on Supabase Postgres.)_
