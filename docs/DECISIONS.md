# Decisions & Cleanup Resolutions

Authoritative record of the decisions from the pre-implementation multi-lens review (architect,
front-end, back-end, product, end-user). Written 2026-07-01; amended in place since (each
amendment is dated where it appears).

> ### Precedence, and what "authoritative" means here
>
> [`SAAS-RESTRUCTURE-PLAN.md`](./SAAS-RESTRUCTURE-PLAN.md) is the **base document and wins on
> conflict** — including against this file. This file is authoritative *below* it: it is the record
> of the locked calls, and every other doc conforms to it. Where a restructure phase has overtaken
> a decision, the decision carries a dated amendment rather than being deleted, so the reasoning
> survives.
>
> **Paths written before the restructure are not where code lives now.** This document names
> `server/**`, `lib/**` and `app/api/**/route.ts`; Phase 2 moved every file into a
> `@destaworks/*` package and Phase 4.3 deleted the App Router API. The mapping table at the top of
> [`STACK-ARCHITECTURE.md`](./STACK-ARCHITECTURE.md) translates them. The **rules** below are
> current; the **paths** are historical.

---

## Locked decisions (owner/engineer calls)

**D1 — Migration = one-shot ETL, no Sheet adapter.** We do NOT build an anti-corruption layer
that reads the Google Sheet live. Each entity is extracted → transformed → loaded into Postgres
once, with a short **read-only freeze / delta re-sync** at final cutover. Delete all "adapter /
dual-read" language from ARCHITECTURE, EDD, MIGRATION-PLAN, PLAN.

**D2 — Split-brain fix = reorder so the funnel cuts over together.** Sourcing + Discover move up
to sit with the candidate/pipeline cutover, so **find → promote → pipeline all live on the new app
at the same time.** No window where legacy promote writes a candidate the new pipeline can't see.
Until a domain is ported, legacy writes to that domain are **frozen/redirected** (not dual-run).

**D3 — RBAC = fixed 6 roles + capability groups.** Roles: `Owner, Director, Manager, Screener,
Associate, Admin`. **"Leadership" is a capability group in code**, not a hardcoded
role list — guards check capabilities (e.g. `can('viewReports')`), mapped from role. **`admin` is a
role value** (not a separate boolean flag). **Custom-role creation
is deferred to v2.** Better Auth stores `role` as a validated string; a zod `Role` guard + typed
session cast gives type-safety (we do not fight Better Auth to make it a Postgres enum — the fixed
set lives in `@destaworks/domain`'s constants + zod, enforced server-side). `schema.prisma`
declares **no `enum` blocks at all**; every status-like column is a string backed by a domain
constant, and role is no exception.

**D3 amended 2026-08-31 — authority lives on the Membership, not the account.** Phase 6 made the
installation multi-tenant, so "an account is exactly one role" no longer holds: a user has one
`Membership` per workspace and **the role on the membership for the active workspace is what
authorizes**. `requireCapability` resolves through the membership. The `User.role` column still
exists and is still written by `seed-owner.ts` and `admin-user.service.ts`, but it authorizes
nothing in application code — it is retained only because Better Auth's admin plugin declares the
field itself and gates its own account-management endpoints on it, so removing the remap would 403
that whole surface. What retiring it would take is recorded in `SAAS-RESTRUCTURE-PLAN.md` 6.4.

*Two checks, not one — do not conflate them.* `requireCapability` authorizes the **actor**: it
proves this person may administer accounts in the workspace they are signed in to. It says nothing
about the **target**, and the Better Auth admin endpoints address the global `User` table by a
caller-supplied id. Until 2026-08-31 that gap was live: an administrator of one workspace could
name any user id on the installation and ban, delete, re-role or reset the password of another
customer's staff, because the Better Auth call landed before the audit write that failed. Every
`adminUserService` mutation now resolves the target's `Membership` in the acting tenant first. A
claim that this surface "cannot escalate" is only true with **both** checks in place.

**D4 — License verification (Biruh priority #3) = assisted queue in v1, automation fast-follow.**
v1 ships a **verification queue** (candidates needing verification, one-click state-board links,
editable status, expiry timeline). Real per-state automated verification is a **fast-follow**
(spike + per-state adapters, partial coverage). **CLIENT-BRIEF wording corrected** from "automated"
to "assisted verification, with automation as a fast-follow."

**D5 — Daily accountability loop pulled earlier + protected.** Overview ("since you closed" +
Today's Targets) and Daily Log move **out of the deferrable tail** into an earlier wave (they're
daily-use / Step 10 of the flagship flow). The **deferrable/risk-buffer items become CRM analytics
and the heaviest reports** instead (still shipped, but first to flex if time runs short — never the
daily loop, pipeline, or funnel).

**D6 — Three isolated environments on their own domains: local · staging · production.**
Production = **`zyx.com`** (`main` branch), staging = **`staging.zyx.com`** (`staging` branch),
plus per-PR Vercel preview URLs and local. (`zyx.com` = placeholder for the real domain.)
**Staging and production use two separate Supabase projects** — staging never touches production
PII. Secrets, `BETTER_AUTH_URL`, and Google OAuth redirect URIs are **per-environment/per-domain**
(no shared keys). **Migrations and the Sheet→Postgres data migration are dry-run on
`staging.zyx.com` first, then applied to production.** Set up in Wave 0 (`IMPLEMENTATION-PLAN.md`
0.1b / 0.2). Needs from Biruh: domain/DNS access, Vercel, the two Supabase projects.

*Amended 2026-08-31 — two hosts, and deploys are manual.* Since Phase 4 the API is a long-lived
process, so an environment is **two** deployments, not one: `apps/web` on Vercel and `apps/api`
plus its worker on **Render** (`render.yaml`). The Vercel project has **no Git integration** —
nothing deploys on push. `.github/workflows/deploy.yml` is dispatched by hand with a full commit
SHA, refuses any revision whose four required checks (Commit messages · Static analysis · Tests ·
Build) are not green, ships the API first and waits for `/health`, then the web app, then tags the
revision `deploy/<env>-YYYY-MM-DD-<run>`. **Those four are not all five CI jobs: `Tenant isolation`
is deliberately absent from the gate**, so the one job that proves tenant A cannot read tenant B —
per table, against a real Postgres — is not required to ship. That is a gap, recorded here rather
than left to be discovered from the workflow file; it should be added to the required set before
the installation carries a second tenant. The domain placeholder `zyx.com` is still unresolved: the
real production domain and database have not been provisioned, so today's deployed environment is
**staging**.

**D7 — Server-state fetching = RSC reads + typed `ApiResult<T>` mutation helpers, not TanStack
Query (supersedes the "Client-state classification" line under Resolved review findings →
Front-end).** The pre-implementation review planned TanStack Query as the server-state layer, but
it was never adopted (`package.json` has no dependency on it) — every wave shipped since Wave 0
(0.6 through 3.5) instead uses, with zero deviation: **reads** are Server Components
(`app/(app)/<feature>/page.tsx`, or a `lib/load-*.ts` composite loader for multi-read pages) that
call `server/services/**` directly and pass DTOs down as props — no client-side data-fetching
library, no request waterfall; **mutations** go through `lib/api/client.ts`'s typed
`getJson`/`postJson`/`patchJson`/`putJson`/`deleteJson` helpers, returning a discriminated
`ApiResult<T>` the UI branches on directly (`form.setError` for field issues,
`messageForFailure` + a Sonner toast otherwise); success calls `router.refresh()` (re-runs the
RSC read) or patches local `useState` for snappier UX. The one case needing optimistic UI (the
pipeline board's card move) uses React's built-in `useOptimistic` + `useTransition`, not a
query-cache library's `onMutate`/rollback. This is a **formal decision, not an unaddressed
gap** — this proven pattern is the standard going forward; do not reach for TanStack Query (or
any other client cache library) in new work. Full detail: `STACK-ARCHITECTURE.md` §6, code
standard rules: `CONVENTIONS.md` §5.

**D7 revisit criteria (added 2026-08-27).** Deferred with conditions rather than closed, so the
next person neither follows it blindly nor overturns it blindly. The decisive question is **whether
the browser is doing the fetching** — today it barely is, since reads are RSC and mutations go
through the `ApiResult<T>` helpers. Adding a client cache now would put a second cache in front of
state RSC already caches, for a fetching pattern that does not exist.

Note what does **not** trigger it: the Phase 4 move to a NestJS API (`SAAS-RESTRUCTURE-PLAN.md`
4.0, Option A) makes the **RSC render** an HTTP client, but that hop is server-to-server. The right
tool there is Next's server-side `fetch` cache, not a browser cache library.

Reconsider when any one of these becomes true:

1. **A mobile client exists** — no RSC at all, so TanStack becomes the obvious answer rather than a
   competing one.
2. **The platform-admin console is genuinely interactive** — live tenant health, polling, infinite
   scroll — rather than the mostly-static reads the operator app has.
3. **A view needs per-query freshness** that `router.refresh()` cannot express without
   re-rendering the whole page.

**D8 — No file/image bytes stored in the database; binaries always go to real object storage.**
Confirmed 2026-07-31 (My Profile avatar-upload review): avatars currently persist a resized
JPEG as a base64 `data:` URI directly in `User.image` (a Postgres text column) via Better Auth's
`updateUser`. This is functional ONLY because the image is deliberately tiny (160×160, resized
client-side before upload) — it is not a pattern to extend. Resumes already avoid this correctly
(`Document.storageKey` is a Wave-6 placeholder; only extracted TEXT persists server-side, the
original PDF bytes are discarded after client-side `pdf.js` extraction). This decision
generalizes that constraint explicitly: no feature, present or future, may persist file/image
bytes — or a base64 encoding of them — as a database column. Wave 6's "move resume files to
object storage" checklist item is amended to cover **avatars too**; until then, the avatar
upload is a **known, tracked exception** (small, bounded, functional), not a precedent for new
work.

**Resolved 2026-08-10** — both sides shipped (`server/integrations/storage.ts`): avatars upload
to Storage via `POST /api/me/avatar` and `User.image` now holds a stable public URL, not a base64
blob; resumes now optionally upload their original bytes via a client-to-Storage signed URL
(`POST /api/resume/upload-url`) and persist `Document.storageKey`, with downloads served through a
fresh, short-lived signed URL (`GET /api/documents/:id/download-url`, gated `viewCredentials`) —
never a persisted signed URL, which would silently go stale. Built against the **S3 protocol**
(`@aws-sdk/client-s3`), not a vendor SDK, so swapping providers later (Supabase Storage today → AWS
S3 / Cloudflare R2 / Backblaze B2 / self-hosted MinIO) is a credentials/endpoint change only — same
"swap the provider, not the code" posture as `AI_MODEL`. **Ships dormant**: no `S3_*` credentials
exist in any environment yet (`storageEnabled` gates every code path, mirroring `aiEnabled`/
`apolloEnabled`) — activates the moment Biruh sets them and runs `pnpm setup:storage` once.

---

## Resolved review findings (apply across docs)

**Backend / data model**
- **Status is codes, not labels.** Enum = stable codes (`NEW_CANDIDATE` … `STARTED_DAY1`) + a
  `stage_order` ordinal + a display-label lookup. Scoring/gates/funnels key off the code/ordinal,
  not the label. Define in `lib/constants` before Wave 0.5.
- **`CLIENT_RULES` is data, not code.** `client_rules` is a table; `scoreCandidate(candidate,
  clientRules)` is pure and takes rules as an argument (so custom clients can be scored).
- **Multi-entity migration.** Every migratable entity gets an ETL task in its own wave (leads →
  Sourcing wave, notes → notes slice, clients/contacts/deals → CRM wave, historical activity →
  where reconstructed). Each carries a `legacy_id` column (idempotent upsert), **email-primary
  dedupe** with name as secondary/manual-review, a defined **merge policy** (keep-newest + flag),
  and a Sheet read-only freeze at final backfill. **Resume→profile matching needs a confidence
  threshold + manual-confirm** (no silent wrong-person matches on PII).
- **Add missing tables to DATA-MODEL:** `stage_history` (+ denormalized `stage_entered_at`,
  `placed_at` on candidate), `LicenseExpiry` on candidate, `role_notes`, `deal_blockers`,
  `client_match_profiles`, `daily_logs`/`journal_entries`/`journal_goals`/`manager_feedback`/
  `shift_handoffs`, `documents` (file metadata), `saved_views`, `client_rules`, and a `capacity`
  field on `clients`.
- **`outreach_attempts`** is one table with nullable `lead_id` + `candidate_id` (serves both
  `source_lead_log_outreach` and `candidate_log_outreach`).
- **`candidates.client` = FK from day one**, seeded from `BASE_CLIENTS` (minimal `clients` table in
  Wave 1), even though the rich CRM UI comes later.
- **Audit vs logs:** `activity_log(before, after)` intentionally stores PII **under access control
  + encryption**; application/observability logs must never contain PII. State this distinction;
  restrict `before/after` reads by capability.
- **PII columns tagged** (`LicenseNumber`, `NPI`, contact) as sensitive → role/capability-restricted
  in DTO mapping + encrypted at rest (app-layer). Mechanism: column omission in the DTO by
  capability, plus AES-256-GCM envelope encryption at the repository boundary, keyed by
  `FIELD_ENCRYPTION_KEY` (`packages/db/src/field-crypto.ts`).
  *Amended 2026-08-31:* the original parenthetical **"since Better Auth means no Supabase RLS" is
  no longer true.** Phase 6 added real Postgres Row-Level Security — `ENABLE` + `FORCE` + a
  `tenant_isolation` policy per tenant-scoped model — enforced by `pnpm rls:check` in CI and proved
  per table against a throwaway Postgres by the **Tenant isolation** job. RLS is a *tenant*
  boundary, not a column-sensitivity one, so it complements the DTO/encryption rules above rather
  than replacing them. What was verified: only `licenseNumber` and the resume extraction output are
  encrypted today — NPI and contact fields are not (see `SECURITY-AUDIT-APP.md`).
- **Transactions:** services call a `withTransaction` helper in `server/db`; repositories receive
  `tx`. The reference example must not call `prisma.$transaction` in a service (it violates the
  `no-prisma-outside-repositories` lint rule).
- **Soft-delete:** a shared Prisma helper/extension applies `deleted_at IS NULL` by default so
  soft-deleted PII never leaks into lists.
- **Indexes:** add `activity_log(entity, entity_id)`, `activity_log(actor, at)`,
  `stage_history(candidate_id)`, `outreach_attempts(lead_id)` & `(actor, day)`,
  `mentions(recipient, read)`, `candidates(status)`, `candidates(client)`, `source_leads(status)`,
  and the soft-delete column.

**Front-end**
- **Styling decided:** translate legacy inline styles → **Tailwind utilities** + a small
  component-class layer. Build a `@theme` token table mapping the legacy `C` palette **and** `SC`
  (13 status colors) **and** common ad-hoc grays to **named** tokens (rename cryptic keys —
  `ch`→`charcoal`, `bl`→`navy`, etc.). "1:1" = same look, not same inline-style soup.
- **shadcn/Radix** adopted **only** for a11y-hard primitives: Dialog, DropdownMenu, Combobox
  (@mention), Toast (Sonner). Bespoke layout hand-rolled. Closes the "optional" question.
- **Client-state classification** *(superseded by D7 above — server-state line only)*: legacy
  `useState` (~180) split into **server-state → RSC reads + `lib/api/client.ts` mutation
  helpers** (not TanStack Query), **ephemeral UI → useState**, **shareable filters/saved-views →
  URL `searchParams` + a `saved_views` table** (not localStorage; localStorage only for
  non-sensitive prefs) — the latter two are unchanged from the original review.
- **RSC vs client:** feature client code lives at `app/(app)/<feature>/` (co-located, not a
  separate `modules/**` tree — see D7/STACK-ARCHITECTURE §3.6); interactive components are
  `"use client"`, RSC is used for the page-level read (and read-only pages: Client Portal,
  Credentials matrix, printable reports).
- **Optimistic updates:** kanban moves use React's `useOptimistic` + `useTransition` (not a
  query-cache library's `onMutate`/rollback — see D7).
- **Accessible DnD:** use **dnd-kit** (keyboard + screen-reader), not a 1:1 port of the legacy
  hand-rolled HTML5 DnD.
- **Wave-0 FE baseline (budgeted):** form lib (**react-hook-form + zodResolver**), shared
  `Skeleton`/`EmptyState`/`ErrorState`, a print stylesheet (`print:` variants), responsive/mobile
  pass. a11y + responsive + print become **per-view acceptance items**.
- **Known client defects are corrected, not ported:** index-keyed dismissal + Copilot identity,
  `contentEditable` unsaved-edit clobber, the two un-synced filter namespaces. Rule: **behavior is
  1:1; documented client bugs are fixed.**

**Cross-cutting / foundation**
- **`activity_log` + audit-write helper move to Wave 0** (needed from the first mutation).
- **Minimal `access_requests` table pulled into Wave 0.3** (the request-access screen ports there).
- **Legacy security hardening restored as a Wave-0 task:** audit whether the live Apps Script
  authenticates; if it trusts the client, add a server-side token + role check **to the live app
  now** — independent of the rebuild. (Depends on Apps Script access from Biruh.)
- **Inbound Triage** added as a real build task (was missing entirely) — Wave with Sourcing/CRM.
- **Sticky Note + Template Performance** listed explicitly (in-scope or explicit v2), not dropped
  silently.
- **Signup gating:** public self-registration disabled — account creation is invite/approval-gated.
- **Off-the-shelf lint boundaries** (`eslint-plugin-boundaries` / `import/no-restricted-paths`)
  instead of hand-written AST rules; keep `import "server-only"`.
  *Amended 2026-08-31:* superseded once the tree became packages. The dependency law is now
  enforced by **`scripts/check-architecture.mjs`** (`pnpm arch:check`), which parses every import
  with the TypeScript compiler API and compares it against the workspace manifests; exemptions are
  data in `scripts/architecture-baseline.json` and each carries a `reason`. It is a CI gate, not a
  lint rule.

**Plans / docs hygiene**
- **One authoritative plan:** `IMPLEMENTATION-PLAN.md` (tasks) + `ESTIMATE.md` (schedule) are
  authoritative. `PLAN.md` + `MIGRATION-PLAN.md` are **superseded** (banner + kept for history).
  Update the `CLAUDE.md` doc map accordingly.
  *Amended 2026-08-31:* those two plans covered the Wave 0–6 rebuild, which shipped. The live plan
  for current work is **`SAAS-RESTRUCTURE-PLAN.md`**; IMPLEMENTATION-PLAN and ESTIMATE are now a
  record of what was built and on what schedule, not instructions for new work.
- **Remove stack hedges** ("Vite or Next", "Fastify/NestJS", "auth provider") from ARCHITECTURE/
  EDD/MIGRATION-PLAN — the stack is locked (see STACK-ARCHITECTURE).
- **Fold `CONVENTIONS.md` §3 folder structure** into STACK-ARCHITECTURE's `modules/`+`server/*`.
- **Numbers:** standardize on **~90 operations** and **~180 useState** across all docs.
- **Test rigor reconciled:** tests are **mandatory** for the rules engine, authz-fail cases, and
  migration golden-files; **best-effort** elsewhere ("ship then harden") — not full coverage
  everywhere.

**Product / rollout (new, was missing)**
- **Success metrics** (measurable, per the WHY-MIGRATE promises): page-load target, concurrent-user
  count supported, migration accuracy %, and "pipeline responsive at N candidates."
- **Rollout / change-management:** a **"which app for which task, by month" cheat-sheet** for the
  live users running both apps; a short per-wave recruiter **UAT sign-off**; a **rollback** path if
  a ported view misbehaves in production.
- **Client Portal** (external, exposes candidate PII) gets extra security/QA budget — not one of
  the smallest line items.
- **Week-1 unblock vs "hold the keys":** the 3-month clock **starts at T+0 = keys/data provided**,
  not at "yes." State this in CLIENT-BRIEF §7 and ESTIMATE conditions.
- **Smarter Sourcing (Biruh priority #4)** gets an explicit line item + hours; "find providers like
  this" (net-new similarity) is separated from Open-Roles "match existing candidates to a role."

---

## Net effect on the schedule
These fixes add real hours (FE baseline, multi-entity ETL, smarter-sourcing, assisted-verify queue,
rollout/UAT). Expect the honest total to move up modestly and/or lean harder on the
deferrable-tail (CRM analytics + heaviest reports) as the flex. The 3-month **core+funnel** target
holds; **full parity** may extend into a short fast-follow — which the CLIENT-BRIEF already allows.
