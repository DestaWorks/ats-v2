# DestaHealth ATS — Documentation

Engineering & product documentation for the DestaHealth ATS. These docs are the shared
source of truth as we migrate the app from a single-file prototype to a professional,
production-grade system.

> **Precedence, highest first:** [`SAAS-RESTRUCTURE-PLAN.md`](./SAAS-RESTRUCTURE-PLAN.md) →
> [`DECISIONS.md`](./DECISIONS.md) → everything else. Where a doc conflicts with the plan, the doc
> is what gets corrected.
>
> **Many of the documents below predate the monorepo.** Waves 0–6 were built as a single Next.js
> app with App Router route handlers as the API; the restructure then moved every file into a
> `@destaworks/*` package, moved the API into a separate NestJS process (`apps/api`), deleted those
> route handlers, and made the system multi-tenant. Docs written before that carry a banner saying
> so. The translation table for old paths is at the top of
> [`STACK-ARCHITECTURE.md`](./STACK-ARCHITECTURE.md).

## Read in this order

1. **[../CLAUDE.md](../CLAUDE.md)** — repo orientation & ground rules (start here).
2. **[SAAS-RESTRUCTURE-PLAN.md](./SAAS-RESTRUCTURE-PLAN.md)** — **THE BASE DOCUMENT.** Target
   architecture, the package graph and its dependency law, the engineering standards, and 10
   phases each with a done-when. Read it before starting any task; it wins on conflict.
3. **[DECISIONS.md](./DECISIONS.md)** — the locked decisions + resolved review findings from the
   pre-implementation review. Authoritative below the plan. Read it before the architecture docs.
4. **[ARCHITECTURE-PROPOSAL.md](./ARCHITECTURE-PROPOSAL.md)** — **the architecture decision**:
   multi-tenant SaaS built on a monorepo, with the options weighed and the reasoning. The "why"
   behind the plan you just read.
5. **[PROJECT-CONTEXT.md](./PROJECT-CONTEXT.md)** — engagement, company, portfolio, and the
   binding NDA/compliance constraints (the "why and under what rules").
6. **[PRODUCT-WALKTHROUGH.md](./PRODUCT-WALKTHROUGH.md)** — the product as a plain-English user
   journey (login → work → logout), zero tech talk. Best first read to *feel* the product.
   **[USER-FLOW-SOURCE-TO-HIRE.md](./USER-FLOW-SOURCE-TO-HIRE.md)** — click-by-click of the
   flagship flow: one candidate from found to hired.
   **[MIGRATION-CHEATSHEET.md](./MIGRATION-CHEATSHEET.md)** — for the daily users: which app
   (old vs new) to use for which task, month by month. *Now historical — see its banner.*
7. **[PRD.md](./PRD.md)** — Product Requirements: what the system does and for whom.
   **[CLIENT-BRIEF.md](./CLIENT-BRIEF.md)** — the send-to-client brief, combining the why
   (problems/risks) and the how/when (3-month plan) in one plain, non-technical document.
   *Dated 2026-07-01; kept as sent.*
   **[WHY-MIGRATE.md](./WHY-MIGRATE.md)** — the internal, detailed risk-and-money analysis behind
   the brief (decay clock, worst cases, the core reason for rework).
   **[BUSINESS-CASE-SAAS.md](./BUSINESS-CASE-SAAS.md)** — the case for selling this as a product.
8. **[ARCHITECTURE.md](./ARCHITECTURE.md)** — §1 the legacy architecture, §2 the system as built.
9. **[DATA-MODEL.md](./DATA-MODEL.md)** — entities, fields, pipeline stages, rules, schema.
10. **[API-CONTRACT.md](./API-CONTRACT.md)** — the ~90 **legacy** backend operations. Not the
    current API: that is 200 route handlers across 49 NestJS controllers in `apps/api`.
11. **[MODULE-BREAKDOWN.md](./MODULE-BREAKDOWN.md)** — deep line-level map of every module, its
    sub-modules, complexity ratings, and hidden gotchas (from reading the full `index.html`).
12. **[EDD.md](./EDD.md)** — Engineering Design for the target system & migration. *Pre-restructure.*
13. **[STACK-ARCHITECTURE.md](./STACK-ARCHITECTURE.md)** — **locked stack + layered architecture
    + conventions**. Its responsibilities are current; its **paths are pre-restructure**, and the
    table at the top of it translates them. Start there when an old path confuses you.
14. **[CONVENTIONS.md](./CONVENTIONS.md)** — coding standards & the git/worktree/PR rules (§1).
15. **[ESTIMATE.md](./ESTIMATE.md)** — the 3-month, 7-wave schedule for the Wave 0–6 rebuild.
    *A record of what was committed to and delivered, not a live schedule.*
16. **[IMPLEMENTATION-PLAN.md](./IMPLEMENTATION-PLAN.md)** — the executable build guide for those
    waves: schema→repo→service→API→client→tests + a "done-when" each. *A record of what was built,
    in the paths of the day.*
17. **[MIGRATION-GAP-ANALYSIS.md](./MIGRATION-GAP-ANALYSIS.md)** — legacy Sheet → Postgres, one
    migrate/derive/drop decision per tab plus what must be restructured before any import. **This
    is the live one of the migration docs** — Phase 7 has not run.
18. **[SECURITY-AUDIT-APP.md](./SECURITY-AUDIT-APP.md)** · **[SECURITY-AUDIT-LEGACY.md](./SECURITY-AUDIT-LEGACY.md)**
    — security review of the new app · of the legacy app.

Also here: **[design/](./design/)** — per-slice design notes written during the wave build (they
use pre-restructure paths); **[reviews/](./reviews/)** — client review correspondence.

_Superseded plans are archived in **[archive/](./archive/)** (`PLAN.md`, `MIGRATION-PLAN.md`) —
kept for history only._

## Status of these docs

The product docs (PRD, DATA-MODEL, MODULE-BREAKDOWN, API-CONTRACT) were reconstructed by
reverse-engineering `index.html`, the entire legacy app, so they are accurate to the
**client-side** code. Backend behavior was initially marked _(assumption)_; the Apps Script source
`Code.gs` was later obtained and is now the authority where the two disagree — it is local-only and
gitignored, so a fresh clone will not have it.

The engineering docs split by era. `SAAS-RESTRUCTURE-PLAN.md`, `CONVENTIONS.md`,
`MIGRATION-GAP-ANALYSIS.md` and `ARCHITECTURE.md` §2 describe the system as it runs today.
`STACK-ARCHITECTURE.md`, `EDD.md`, `DECISIONS.md`, `IMPLEMENTATION-PLAN.md`, `ESTIMATE.md` and
`docs/design/**` were written for the single-app `src/` layout and carry banners saying which parts
still hold.

## Open questions

The three questions this section used to carry are **closed**:

1. ~~Does the Apps Script authenticate & authorize every request server-side?~~ Answered — the
   Apps Script source was obtained and audited; see `SECURITY-AUDIT-LEGACY.md`.
2. ~~How much data exists today (candidates / leads)?~~ Sized per tab in
   `MIGRATION-GAP-ANALYSIS.md`.
3. ~~Is email sent server-side, or only composed via mailto links?~~ The new app sends
   server-side (`packages/integrations/src/email`).

**Still open, and blocking the last step:**

1. **The real production domain and database.** `zyx.com` throughout these docs is still a
   placeholder. Today's deployed environment is **staging**; no separate production Supabase
   project exists yet, so DECISIONS D6's "two separate projects" is a decision, not yet a fact.
2. **When the Phase 7 data migration runs.** The importers are not committed and the Phase 6
   tenancy migrations are authored but deliberately unapplied.

_Resolved: **AI = provider-agnostic** via the Vercel AI SDK — Anthropic, OpenAI and Google
adapters are all installed and selected by the `AI_MODEL` env var; never one vendor hard-wired.
Compliance = HIPAA + Ethiopian Data Protection Proclamation 1321/2024. Hosting = `apps/web` on
Vercel, `apps/api` + worker on Render, Postgres on Supabase. Owner holds all secrets. Sequencing =
ATS. **Auth = Better Auth on Supabase Postgres.**_

## Changelog

- 2026-06-29 — Initial docs suite created (PRD, Architecture, Data Model, API Contract, EDD,
  Conventions, Migration Plan) from reverse-engineering the legacy single-file app.
- 2026-06-29 — Locked the target stack and added **STACK-ARCHITECTURE.md** (layered
  architecture + conventions for Next.js · Prisma · Better Auth · Postgres · Zod · Tailwind ·
  Sonner), grounded in current Better Auth/Prisma + App Router architecture sources.
- 2026-06-30 — Added **PROJECT-CONTEXT.md** from the client onboarding docs (engagement,
  company, portfolio, ATS roadmap) and the Developer NDA (binding constraints: no secrets in
  code, permissive licenses only + SBOM, HIPAA + Ethiopian Data Protection Proclamation
  1321/2024, Owner-held keys). Folded these into CLAUDE.md, PRD, EDD, CONVENTIONS, and
  STACK-ARCHITECTURE; resolved the AI/compliance/hosting/secrets open questions.
- 2026-06-30 — Added **PLAN.md** — the sequenced delivery plan (milestones M0–M6) interleaving
  the platform re-architecture with the four product roadmap features, mapped to the 90-day
  onboarding windows, with a near-term task backlog, dependencies/asks, and decision gates.
- 2026-07-01 — Added **MODULE-BREAKDOWN.md** — deep line-level map of the full `index.html`
  (9,531 lines, read across 9 parallel analyses): every module with sub-modules, sub-tasks,
  key functions/events, per-module Logic/Impl complexity ratings, a complexity heatmap, the
  most-complex ranking, cross-cutting rebuild risks, and the full ~90-event catalog.
- 2026-07-01 — Pre-implementation multi-lens review (architect / FE / BE / product / end-user);
  captured resolutions in **DECISIONS.md** (authoritative) and reconciled all docs to it.
- 2026-07-01 — Docs hygiene pass: added **MIGRATION-CHEATSHEET.md** (which-app-by-month for daily
  users), added Inbound Triage to the walkthrough + flow, slimmed ARCHITECTURE §2 to point at
  STACK-ARCHITECTURE, cross-noted CLIENT-BRIEF↔WHY-MIGRATE, and moved the superseded PLAN.md +
  MIGRATION-PLAN.md into `archive/`.
- 2026-07-01 — Added **DECISIONS D6** (three isolated environments on their own domains:
  production `zyx.com`, staging `staging.zyx.com`, per-PR previews; two separate Supabase
  projects; per-environment secrets/OAuth; migrations + data migration dry-run on staging first).
  Reflected across IMPLEMENTATION-PLAN (0.1b, 0.2, 1.4), STACK-ARCHITECTURE, CONVENTIONS, EDD,
  and the Biruh asks in ESTIMATE + PROJECT-CONTEXT (added domain/DNS + two Supabase projects).
- 2026-07 → 2026-08 — **the Wave 0–6 rebuild shipped.** Per-slice design notes for the larger
  slices were written under `design/`; the client review correspondence is under `reviews/`. Added
  **SECURITY-AUDIT-LEGACY.md** and **SECURITY-AUDIT-APP.md**.
- 2026-08 — **the SaaS restructure.** Added **ARCHITECTURE-PROPOSAL.md** (the decision),
  **SAAS-RESTRUCTURE-PLAN.md** (the executable plan, now the base document),
  **BUSINESS-CASE-SAAS.md**, and **MIGRATION-GAP-ANALYSIS.md**. Phases 0–6 and 8 landed: monorepo,
  nine `@destaworks/*` packages, the NestJS API, the job runner, multi-tenancy with RLS, and the
  platform-admin console. The App Router API was deleted in 4.3 and the `@/*` aliases in 2.10.
- 2026-08-31 — **doc/code alignment audit.** Corrected the claims the restructure had outdated,
  added precedence banners to the pre-restructure docs, recorded the D3 role-on-Membership and
  RLS amendments in DECISIONS, and wrote the local two-process setup (ports, seed order, the
  worker) into the root README.
