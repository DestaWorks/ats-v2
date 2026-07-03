# Decisions & Cleanup Resolutions

Authoritative record of the decisions from the pre-implementation multi-lens review (architect,
front-end, back-end, product, end-user). Every other doc should conform to this. Where docs
conflict, **this doc wins.** Dated 2026-07-01.

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
Associate, Admin` (a Prisma enum). **"Leadership" is a capability group in code**, not a hardcoded
role list — guards check capabilities (e.g. `can('viewReports')`), mapped from role. **`admin` is a
role value** (not a separate boolean flag) — an account is exactly one role. **Custom-role creation
is deferred to v2.** Better Auth stores `role` as a validated string; a zod `Role` guard + typed
session cast gives type-safety (we do not fight Better Auth to make it a Postgres enum — the enum
lives in `lib/constants` + zod, enforced server-side).

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
  and a Sheet read-only freeze at final backfill. **Résumé→profile matching needs a confidence
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
  in DTO mapping + encrypted at rest (app-layer, since Better Auth means no Supabase RLS). Specify
  the mechanism (column omission in DTO by capability + pgcrypto/envelope for at-rest).
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
- **Client-state classification:** legacy `useState` (~180) split into **server-state → TanStack
  Query**, **ephemeral UI → useState**, **shareable filters/saved-views → URL `searchParams` +
  a `saved_views` table** (not localStorage; localStorage only for non-sensitive prefs).
- **RSC vs client:** `modules/**` default to `"use client"` (they're interactive); RSC reserved
  for `app/` layouts + read-only pages (Client Portal, Credentials matrix, printable reports).
- **Optimistic updates:** kanban moves use `onMutate` + rollback (no visible snap-back).
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

**Plans / docs hygiene**
- **One authoritative plan:** `IMPLEMENTATION-PLAN.md` (tasks) + `ESTIMATE.md` (schedule) are
  authoritative. `PLAN.md` + `MIGRATION-PLAN.md` are **superseded** (banner + kept for history).
  Update the `CLAUDE.md` doc map accordingly.
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
