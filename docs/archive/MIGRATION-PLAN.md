# Migration Plan — Strangler-Fig Roadmap

> **⚠️ SUPERSEDED — kept for history.** The live plan is **`docs/IMPLEMENTATION-PLAN.md`**
> (tasks) + **`docs/ESTIMATE.md`** (schedule), governed by **`docs/DECISIONS.md`** (authoritative).
> This document's **anti-corruption-layer / dual-read / "adapter reads the Sheet" approach is
> retired**: per DECISIONS **D1**, migration is a **one-time ETL** (extract → transform → load,
> with a read-only freeze at cutover), **not** a live Sheet adapter. Read this only for
> historical context; do not build from it.

**Strategy:** Incremental strangler-fig with an anti-corruption layer. The legacy
`index.html` keeps serving users while we build the new system beside it and port views one
at a time. **No big-bang rewrite, no downtime.**

**Decisions on record:** live users daily · proper backend + Postgres · "security now,
refactor steady."

---

## Phase 0 — Stabilize the baseline (days) — DO FIRST

Goal: stop the bleeding and establish a professional foundation. Cheap, high-leverage.

- [ ] Commit the real `index.html` as a clean baseline; stop the upload/delete pattern.
- [ ] Turn on branch protection + PR review on `main`.
- [ ] **Obtain the Apps Script (`Code.gs`) source** and audit whether it authenticates and
      authorizes every request server-side. *(Single most urgent unknown.)*
- [ ] If the backend trusts the client: add server-side auth (shared token / per-user auth)
      and server-side role checks **before anything else**.
- [ ] Inventory secrets currently in client (backend URL, OAuth client ID); plan rotation.
- [ ] Land the docs suite (this folder) as the shared source of truth. ✅ (in progress)

**Exit criteria:** baseline in git, review process on, security posture of the backend known
and the worst holes closed.

## Phase 1 — New foundation alongside (weeks 1–2)

Goal: a real project that runs next to the legacy app; users still on legacy.

- [ ] Scaffold the new app: React + TypeScript + build (Vite/Next), ESLint, Prettier, CI.
- [ ] Stand up Postgres (managed) + Prisma; first migration from `docs/DATA-MODEL.md`.
- [ ] Implement auth provider + server-side RBAC skeleton.
- [ ] Build the **Anti-Corruption Layer**: typed API that can read the existing Sheet via an
      adapter, so UI can be built before data is migrated.
- [ ] Port the **domain rules engine** (scoring, disqualify, stage gates, status normalize)
      into `domain/` with unit tests.

**Exit criteria:** new app deploys, authenticates, serves real (Sheet-backed) data through a
typed API, CI green.

## Phase 2 — Data model & migration (weeks 2–3)

- [ ] Finalize Postgres schema (enums, soft-delete, audit columns).
- [ ] Write idempotent Sheet→Postgres import (normalize statuses, expand outreach JSON, map
      roles, dedupe) with an added/skipped/errored report.
- [ ] Dual-read window: API serves Postgres, reconciles against Sheet; verify parity.
- [ ] Flip the ACL from Sheet-adapter to Postgres repositories.

**Exit criteria:** Postgres is the source of truth; Sheet is read-only legacy.

## Phase 3 — Strangle the UI, view by view

Order by value/risk. For each: build → QA vs legacy → enable subset → enable all → delete
legacy code for that view.

1. [ ] **Pipeline (kanban + table)** — core; exercises candidates + rules + audit.
2. [ ] Add/Edit Candidate + Notes/Mentions.
3. [ ] Sourcing (leads, outreach, promote, bulk import).
4. [ ] Resume Parse + Discover (NPPES) + Verification.
5. [ ] Daily/Weekly Briefs + Overview.
6. [ ] Templates + Inbound.
7. [ ] CRM + Deals + Open Roles.
8. [ ] Reports / KPI / Performance.
9. [ ] Admin Panel + Profile + invites/access requests.
10. [ ] **Client Portal** (separate audience) — last.

**Exit criteria:** every view served by the new app; `index.html` no longer the product.

## Phase 4 — Decommission

- [ ] Move all AI calls server-side with server-held keys.
- [ ] Migrate resume files to object storage with signed URLs.
- [ ] Retire the Apps Script endpoint and the Google Sheet; rotate exposed credentials.
- [ ] Delete legacy `index.html`.
- [ ] Add observability (error tracking, structured logs) and finalize the audit log.

**Exit criteria:** single, typed, tested codebase; no Sheets, no in-browser Babel, no
client-trusted auth.

---

## Risk register

| Risk | Mitigation |
|------|------------|
| Backend currently unauthenticated → live data exposure | Phase 0 audit + immediate server-side auth |
| Data loss during migration | Idempotent imports, dual-read parity check, Sheet kept read-only until confident |
| Behavior drift while porting | Preserve-behavior rule + QA each view against legacy |
| Scope creep (redesign during migration) | Migration ≠ redesign; UX changes are separate, later work |
| Apps Script quota / Sheet limits worsen before cutover | Prioritize moving high-volume entities (candidates, leads) early |
| Lost context (one-person knowledge) | These docs + tests encode the knowledge |

## Definition of done (overall)

Server-enforced auth & RBAC · Postgres with migrations & audit · typed/tested/modular
codebase · AI keys server-side · resumes in object storage · legacy file removed · CI gating
every change.
