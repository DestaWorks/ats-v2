# DestaHealth ATS — Documentation

Engineering & product documentation for the DestaHealth ATS. These docs are the shared
source of truth as we migrate the app from a single-file prototype to a professional,
production-grade system.

## Read in this order

1. **[../CLAUDE.md](../CLAUDE.md)** — repo orientation & ground rules (start here).
2. **[DECISIONS.md](./DECISIONS.md)** — **AUTHORITATIVE.** The locked decisions + resolved
   review findings from the pre-implementation review. Where any other doc conflicts, this
   one wins. Read it before the plans and architecture docs.
3. **[PROJECT-CONTEXT.md](./PROJECT-CONTEXT.md)** — engagement, company, portfolio, and the
   binding NDA/compliance constraints (the "why and under what rules").
4. **[PRODUCT-WALKTHROUGH.md](./PRODUCT-WALKTHROUGH.md)** — the product as a plain-English user
   journey (login → work → logout), zero tech talk. Best first read to *feel* the product.
   **[USER-FLOW-SOURCE-TO-HIRE.md](./USER-FLOW-SOURCE-TO-HIRE.md)** — click-by-click of the
   flagship flow: one candidate from found to hired.
   **[MIGRATION-CHEATSHEET.md](./MIGRATION-CHEATSHEET.md)** — for the daily users: *which app
   (old vs new) to use for which task, month by month* during the rebuild.
5. **[PRD.md](./PRD.md)** — Product Requirements: what the system does and for whom.
   **[CLIENT-BRIEF.md](./CLIENT-BRIEF.md)** — **the send-to-client brief** — combines the why
   (problems/risks) and the how/when (3-month plan) in one plain, non-technical document. *Send
   this one.*
   **[WHY-MIGRATE.md](./WHY-MIGRATE.md)** — the internal, detailed risk-and-money analysis behind
   the brief (decay clock, worst cases, the core reason for rework).
6. **[ARCHITECTURE.md](./ARCHITECTURE.md)** — current (as-is) and target (to-be) architecture.
7. **[DATA-MODEL.md](./DATA-MODEL.md)** — entities, fields, pipeline stages, rules, schema.
8. **[API-CONTRACT.md](./API-CONTRACT.md)** — the ~90 legacy backend operations (de-facto API).
9. **[MODULE-BREAKDOWN.md](./MODULE-BREAKDOWN.md)** — deep line-level map of every module, its
   sub-modules, complexity ratings, and hidden gotchas (from reading the full `index.html`).
10. **[EDD.md](./EDD.md)** — Engineering Design for the target system & migration.
11. **[STACK-ARCHITECTURE.md](./STACK-ARCHITECTURE.md)** — **locked stack + layered architecture
    + conventions** (Next.js · Prisma · Better Auth · Postgres · Zod · Tailwind · Sonner). The
    definitive build reference.
12. **[CONVENTIONS.md](./CONVENTIONS.md)** — general coding standards & git/PR rules.
13. **[ESTIMATE.md](./ESTIMATE.md)** — **the LOCKED 3-month plan**: 7 waves, per-module hours,
    month-by-month, roles, conditions, and the honest risk/safety-valve. The committed schedule.
14. **[IMPLEMENTATION-PLAN.md](./IMPLEMENTATION-PLAN.md)** — **the executable build guide**: every
    wave/module broken into schema→repo→service→API→client→tests tasks + a "done-when" for each.
_Superseded plans are archived in **[archive/](./archive/)** (`PLAN.md`, `MIGRATION-PLAN.md`) —
kept for history only. The live plan is DECISIONS + IMPLEMENTATION-PLAN + ESTIMATE._

## Status of these docs

Reconstructed by reverse-engineering `index.html` (the entire legacy app). They are accurate
to the **client-side** code. Anything depending on **backend** behavior is marked
_(assumption)_ because the Google Apps Script source is not in this repo and must be
confirmed.

## Top open questions (blockers worth resolving early)

1. Does the Apps Script authenticate & authorize every request server-side? *(security)*
2. How much data exists today (candidates / leads)? *(migration sizing)*
3. Is email actually sent server-side, or only composed via mailto/compose links?

_Resolved: AI provider = Claude API; compliance = HIPAA + Ethiopian Data Protection
Proclamation 1321/2024; hosting = Vercel + Supabase; Owner holds all secrets; sequencing = ATS;
**auth = Better Auth on Supabase Postgres**._

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
