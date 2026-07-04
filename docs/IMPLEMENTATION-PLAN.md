# Implementation Plan — DestaHealth ATS Rebuild (Task Breakdown)

The executable build guide, broken into **small tasks**. Read with `STACK-ARCHITECTURE.md`
(layers/folders), `DATA-MODEL.md` (entity reference), and `ESTIMATE.md` (schedule).

## How we build (two rules)

1. **Vertical slices, not horizontal layers.** We do NOT define all the database tables or all
   the API endpoints up front. **Each feature brings only the tables and endpoints it needs, added
   when we build that feature.** Schema grows one migration per feature; endpoints grow one route
   per feature.
2. **Small tasks.** Every feature is a checklist of small steps (each ~1–4 h). We do them one at a
   time, each behind its own small PR with tests.

**The per-task rhythm** (applies to every checkbox that touches data):
`add just this feature's model → migrate → repository method → service (logic + authz + audit) →
zod schema → this feature's endpoint → port this piece of UI 1:1 → hook → test → retire the legacy
piece.`

**Done-when (every feature):** works end-to-end on real data · authz enforced server-side · inputs
validated · changes audited · tests green · legacy piece retired.

---

# WAVE 0 — Foundation (Month 1)

### 0.1 Project & tooling  ✅ *(done — branch `wave-0-foundation`)*
- [x] Create Next.js (App Router) + TypeScript app with **pnpm**. *(Next 15.5)*
- [x] Add Tailwind v4 (`@import "tailwindcss"` + `@theme` with the legacy palette + status colors).
- [x] Add Sonner `<Toaster/>` to the root layout.
- [x] Add ESLint (flat config) + Prettier + Vitest.
- [x] Create the layered folders (`app`, `modules`, `server/{services,repositories,rules,auth,db,ai,http}`, `lib/{validation,utils,constants}`, `components/ui`).
- [x] Add **off-the-shelf** lint boundary (`import/no-restricted-paths`: `modules/**` & `lib/**` cannot import `server/**` — verified fires). Fuller rules + `import "server-only"` added as layers land.
- [x] Add CI workflow (typecheck + lint + test + format:check on PR/push).
- [ ] **Branch protection on `main`** — *needs the GitHub remote (Biruh); config-only, do when repo is pushed.*
- **Done-when:** ✅ `pnpm build` compiles; typecheck/lint/test/format all green; a cross-layer import fails lint (proven). *(Branch protection pending remote.)*

### 0.1b Environments & domains — local · staging · production (set up early)
Three isolated environments from day one, each on its own domain; **staging and production never
share a database.** *(`zyx.com` below is a placeholder for the real domain.)*

| Environment | Domain | Deploys from | Database |
|---|---|---|---|
| **Production** | `zyx.com` (+ `www.zyx.com` → apex) | `main` | Supabase `desta-ats-prod` |
| **Staging** | `staging.zyx.com` | `staging` branch | Supabase `desta-ats-staging` |
| **Preview** | auto `*.vercel.app` per PR | any branch/PR | staging DB (or an ephemeral one) |
| **Local** | `localhost:3000` | dev machine | local or staging DB |

- [ ] **Vercel:** connect the repo; add the custom domains — `zyx.com` + `www.zyx.com` on the
      **production** environment, `staging.zyx.com` on the **staging** environment. DNS: point the
      apex + `www` + `staging` records at Vercel (Biruh, as domain owner). HTTPS is automatic.
- [ ] **Supabase:** **two separate projects** — `desta-ats-staging` and `desta-ats-prod`
      (separate databases, separate credentials). *Never point staging at production PII.*
- [ ] **Env vars per environment** (in Vercel + `.env.example`, no secrets committed): `DATABASE_URL`,
      Better Auth secret + `BETTER_AUTH_URL` (the env's own domain), Google OAuth creds, Claude API
      key — a **distinct set** for local / staging / prod.
- [ ] **Google OAuth redirect URIs** registered for **all three** origins (`localhost`,
      `staging.zyx.com`, `zyx.com`) or sign-in breaks per environment.
- [ ] Promotion path: branch → preview URL → merge to `staging` (QA on `staging.zyx.com`) → merge to
      `main` (live on `zyx.com`). Migrations + the data migration run **staging first, then production.**
- **Done-when:** `staging.zyx.com` and `zyx.com` serve independently off their own Supabase projects;
  a PR gets its own preview URL; sign-in works on each domain; no environment shares another's DB or keys.
- *Depends on Biruh: domain ownership/DNS access, Vercel, and the two Supabase projects (T+0 items).*

### 0.2 Database connection (no tables yet)  🟡 *(staging done; prod project pending)*
- [x] ~~Create the Supabase projects (staging + prod)~~ **Staging** Supabase project created + `DATABASE_URL` (transaction pooler, `pgbouncer=true`) and `DIRECT_URL` (session pooler, for migrations) wired. **Prod project not yet created** (separate Supabase project per D6, at cutover).
- [x] `prisma init` + `prisma.config.ts` (reads `DIRECT_URL`) + `server/db/prisma.ts` singleton (Prisma 7 `prisma-client` generator → `src/generated/prisma`, `@prisma/adapter-pg` driver adapter, HMR-safe).
- [ ] Migrations flow **staging → production** (never author schema directly against prod) — *N/A until the prod project exists.*
- **Done-when:** the app connects to Postgres per environment; `prisma migrate dev` works on an empty
  staging schema and the same migration applies cleanly to production. *(Staging verified; prod re-apply pending its project.)*

### 0.3 Auth + RBAC (brings ONLY auth + access-request tables)  ✅ *(done — forgot-password deferred, see note)*
- [x] Add Better Auth models to Prisma (User/Session/Account/Verification) + `role` field → migrate. *(migration `20260703085928_init_auth`)*
- [x] Add a **minimal `access_requests` model** → migrate *(the request-access screen ports here; full admin CRUD lands in Wave 5)*.
- [x] Configure `server/auth/auth.ts` (Prisma adapter, email/password + Google, `nextCookies()`). *(Prisma 7 + `@prisma/adapter-pg` over the Supabase pooler; Google wires only when both creds are present via `googleEnabled`; dev-only `trustedOrigins` for localhost.)*
- [x] **Disable public self-registration** — `emailAndPassword.disableSignUp: true`; new accounts come only from the seed / an approved access request.
- [x] Add `app/api/auth/[...all]/route.ts` + `lib/auth-client.ts`.
- [x] Define the **fixed `Role` enum** in `lib/constants` (`ROLES` + `isRole` guard, D3): Owner, Director, Manager, Screener, Associate, Admin. **`admin` is a role value** — one role per account. **Custom-role creation deferred to v2.**
- [x] Define **capability groups in code** (`ROLE_CAPABILITIES` map) + `hasCapability(role, cap)`; **"leadership" is a capability group** (`hasCapability(role, 'viewReports')`), *not* a hardcoded role list.
- [x] Write guards: `requireUser`, `requireRole`, `requireCapability` (`server/auth/guards.ts`) — role is read from the session/DB and coerced through `isRole`, never trusted from the client.
- [x] Port sign-in screen 1:1 + wire it (`(auth)/sign-in`, `useZodForm` + `signInSchema`, conditional Google button).
- [x] Port request-access (writes `access_requests` via service → repository) 1:1. **Forgot-password screen deferred** — needs an email transport (not yet configured) and sign-up is off, so it's low-priority; tracked for a later Wave 0 slice.
- [x] Test: `guards.test.ts` proves a non-admin (`Associate`) is blocked from `requireCapability('viewReports')` and `requireRole('Owner','Admin')` server-side, that a forged/unknown role coerces to `Associate`, and that leadership/admin roles pass. Verified end-to-end against the live DB: correct password → 200 + session (role `Owner` from DB); wrong password → 401.
- **Done-when:** real sign-in works; public signup is off; role comes from DB; capability checks enforced server-side; a non-admin provably can't reach admin. ✅

### 0.4 API skeleton  ✅ *(done — `server/http`)*
- [x] `server/http/api-handler.ts` — `apiHandler(fn)` wraps a route handler: `AppError` → `{error:{code,message}}` at `err.status`; `ZodError` → **422** with `{code:"BAD_REQUEST", message, issues[]}` (path+message); anything else → **500** with a fixed generic message (no leaked stack/message; PII never logged). `json(data, status)` success helper.
- [x] `AppError` type + response helpers — `AppError` (0.3) reused as-is; response mapping lives in `api-handler.ts`.
- [x] Sample guarded route + test — `app/api/me/route.ts` (GET → `requireUser()` → `{id,email,name,role}`); `api-handler.test.ts` (5) + `me.route.test.ts` (2) prove FORBIDDEN→403, ZodError→422, generic error→500 *without leaking the message*, and the end-to-end guarded route: no session→401, valid session→200.
- **Done-when:** ✅ one end-to-end guarded route (`/api/me`) passes tests; build compiles the route.

### 0.5 Audit foundation (brings ONLY `activity_log`) — before any mutation  ✅ *(done — `server/db` + `server/services`)*
- [x] Add `ActivityLog` model (`entity, entityId, actor, at, action, before Json?, after Json?`) → migrated (`20260703093152_add_activity_log`, applied to staging). *(Every future mutation writes here; exists before the first write ships.)*
- [x] `writeAudit(tx, {...})` helper in `server/db/audit.ts` — takes a `Prisma.TransactionClient` so the log row is written **inside the same transaction as the mutation** (atomic).
- [x] `before/after` reads restricted by capability — `auditService.listAuditForEntity` gates on **`viewAudit` (admin-only)**, the conservative compliance default since snapshots may hold PII/PHI (HIPAA / Ethiopian DPP). *(Reconciled onto the existing `viewAudit` capability rather than adding a second one; widen to leadership later if needed.)* App/observability logs never contain PII.
- [x] Indexes: `@@index([entity, entityId])`, `@@index([actor, at])`.
- **Done-when:** ✅ any service can atomically write an audit row (`writeAudit(tx, …)`); PII in `before/after` is capability-gated (`audit.service.test.ts` proves Associate→FORBIDDEN, admin→reads).

### 0.6 Front-end baseline (budgeted, shared)  ✅ *(done)*
- [x] Add **react-hook-form + `zodResolver`** as the standard form stack — `lib/forms/useZodForm(schema)` + `components/ui/Field`; first shared schema `lib/validation/auth.ts` (`signInSchema`, `accessRequestSchema`) reused in Wave 0.3.
- [x] Build shared **`Skeleton` / `EmptyState` / `ErrorState`** (+ `Spinner`) components with a11y roles/live regions.
- [x] Add **dnd-kit** (`@dnd-kit/core` + `sortable` + `utilities`) as the accessible DnD primitive (Pointer + Keyboard sensors) — *not* a port of the legacy HTML5 DnD.
- [x] Add a **print stylesheet** (`@media print` + `.no-print` + `@page`; Tailwind `print:` variants available) and reduced-motion handling + `.sr-only`.
- [x] a11y + responsive + print are now **per-view acceptance items**.
- [x] Wired + proven in a `/styleguide` route (display states, a zod-validated form, keyboard-accessible sortable). Zod validation also covered by unit tests.
- **Done-when:** ✅ shared FE primitives exist, wired into the styleguide route, forms validate via zod; build + 57 tests green.

### 0.7 Domain constants — pipeline status as CODES (before the rules engine)  ✅ *(done)*
- [x] Define pipeline status in `lib/constants` as **stable CODES** (`NEW_CANDIDATE` … `STARTED_DAY1`) + a `stage_order` ordinal + a **display-label lookup** — **NOT** a DB enum of label strings. *(`pipeline-status.ts`)*
- [x] Scoring / gates / funnels key off the **code + ordinal**, never the label; legacy label↔code interop for the migration ETL (`toLegacyStatusLabel`/`fromLegacyStatusLabel`).
- [x] Ported the rest: roles + capability map (`roles.ts`, D3), credentials/populations/settings/sources/tags/track/license (`candidate.ts`), states + NLC compact (`states.ts`), lead statuses (`lead-status.ts`). SLA days folded onto each stage.
- **Done-when:** ✅ status codes + ordinals + label lookup exist as the single source consumed by 0.8; 15 constants tests green.

### 0.8 Rules engine (no tables; pure logic)  ✅ *(done — `server/rules`)*
- [x] Port `scoreCandidate(candidate, clientRules)` — **pure, takes rules as an argument** — + unit tests. *(`scoring.ts`)*
- [x] Port `getAutoDisqualify` + tests. *(`disqualify.ts`)*
- [x] Port `STAGE_REQUIRED` (keyed on status codes, track-aware) → `checkStageGate`/`canTransition` + tests. SLA (`STAGE_ALERTS`) lives on the stage constants; timing helpers `getDaysInStage`/`isOverdue`/`isStuck` key off **`stageEnteredAt`** (fixes the legacy `UpdatedAt` overload) + tests.
- [x] `CLIENT_RULES` treated as **data** (`ClientRules` passed as an argument); `normalizeLeadStatus` ported + tests.
- **Done-when:** ✅ rules match legacy on sample inputs; **37 rules-engine tests** green (52 total across the app). Rules are pure & server-authoritative; client will display server-computed results.

### 0.9 Legacy security hardening (parallel track — LIVE app)  🔴 *(audited — CRITICAL exposure found; fix pending owner)*
- [x] **Audited** the live Apps Script (`legacy/Code.gs`) — **it does NOT effectively authenticate requests.** Full findings: `docs/SECURITY-AUDIT-LEGACY.md`. Auth code exists (`verifySession_`, server-side `getUserRole_`) but is **unwired**: the client sends no token, `doGet` has no auth at all (unauthenticated PII/credential dump), `ENFORCE_AUTH` defaults off, `ats_purge_candidate` is ungated, and `change_password` trusts a client `admin:true` flag. The web-app URL is public in the github.io client source. **Severity: CRITICAL** (live PHI/PII, HIPAA + Ethiopian DPP).
- [ ] Add server-side auth to the LIVE app — ordered remediation in the audit doc (wire client token → accept it in `verifySession_` → gate `doGet` → confirm `ATS_Profiles` roster → set `ENFORCE_AUTH='true'` + gate purge + fix `change_password` → redeploy new `/exec` URL). **Engineer writes the patch; owner applies/deploys** (no automated writes to the live system).
- [ ] Rotate: redeploy to a fresh web-app URL after lockdown; stop storing plaintext passwords.
- **Done-when:** the live app rejects unauthenticated/unauthorized calls. *(Gap is now documented + escalated per the fallback done-when; the fix lands once the owner greenlights changes to the live Apps Script.)*

---

# WAVE 1 — Data In (Month 1)

### 1.1 Candidate schema (brings ONLY candidate + minimal client tables)  ✅ *(done — design `docs/design/wave-1.1-candidate-schema.md`)*
- [x] `candidates` model (simplified from the legacy 32 cols → 28 keep · 1 drop `TelehealthPref`→tag · 3 defer resume→`documents` in 1.2); status as **code** + `stageOrder` mirror + `track` + `licenseStatus` → migrated (`20260703123908_add_candidate_client_stagehistory`).
- [x] Denormalized `stageEnteredAt` + `placedAt` (set-once on `STARTED_DAY1`) drive days-in-stage / SLA; `stage-timing.ts` reads `stageEnteredAt`, fixing the legacy `UpdatedAt` overload.
- [x] Minimal `clients` model seeded from `BASE_CLIENTS` (`lib/constants/clients.ts`, `scripts/seed-clients.ts` / `pnpm db:seed:clients`, idempotent); `candidates.clientId` **FK from day one** (`onDelete: SetNull`).
- [x] `stage_history` model (`onDelete: Cascade`) → migrated; every `move` appends a row atomically.
- [x] Candidate repository: `create`, `findById`, `findByLegacyId`/`upsertByLegacyId` (ETL, idempotent), `list` (filters: status/track/client/search/tags), `update`, `softDelete`, `restore` — **soft-delete excluded by default at the repository layer** (not a global Prisma extension, so Better Auth models are untouched). Plus `stage-history` repo, `withTransaction` helper, `toCandidateDTO` (PII boundary — `licenseNumber` gated on `viewCredentials`), `toRuleCandidate` mapper, and `candidateService` (`create` forced to `NEW_CANDIDATE`; `move` = server-authoritative `checkStageGate` → atomic update+history+`writeAudit`).
- **Done-when:** ✅ candidate + client + stage_history tables exist; `candidates.clientId` FK resolves to a seeded client; repo/service/DTO tested (**90 tests green**); reviewed (architect→backend→review; 1 gate-bypass fixed). *(audit lives in 0.5.)*

### 1.2 Parse Resume (Module 8)  ✅ *(done — design `docs/design/wave-1.2-parse-resume.md`)*
- [x] `server/ai/parse-resume` — zod-validated structured extraction. **Provider-agnostic** (owner directive): `AI_MODEL` `"provider/model"` config string (Claude/OpenAI/Gemini via the Vercel AI SDK) — swap providers with one env var, no code change. Key-gated (`resumeExtractionEnabled`).
- [x] `POST /api/resume/extract` route (+ `POST /api/resume/save`) — `apiHandler` + `requireUser` + zod.
- [x] PDF upload + role-picker UI; **client-side pdf.js** text extraction (worker via `new URL(...import.meta.url)`).
- [x] Inline-editable review UI — react-hook-form + zod (not contentEditable) with add/remove-row editing (OQ-4).
- [x] 3 résumé layouts (clinical/prescriber/operations).
- [x] `résumé→profile` matching (`resume.match.ts`): email-exact → auto-attach (email dedupe, D-8); name-fuzzy ≥ threshold → **manual confirm**; else new. **Server recomputes the match** and never attaches below threshold / to a non-re-matching `confirmedCandidateId` (no wrong-person PII merge). Brings the **`documents` table** (deferred from 1.1) — PII-gated DTO (`extractedData`/`extractedText` behind `viewCredentials`).
- [x] Tests: mapper, match threshold (incl. no-silent-merge + IDOR refusal), routes (auth/key-absent/mocked provider), client confirm-gate. Reviewed (architect→backend+provider-refactor→frontend→review; M1 auto/decline contract fixed). **134 tests, build green.**
- **Done-when:** ✅ upload a résumé → structured candidate data → saved; email match auto-attaches (dedupe), fuzzy match requires explicit confirm, no match creates new. *(Activates when an `AI_MODEL` provider key is set — same key-agnostic pattern as Google OAuth.)*

### 1.3 Bulk Import / Candidate ETL (Module 20)
- [ ] Importer service: parse Sheet export (CSV/JSON).
- [ ] Transform: `normalizeStatus` (→ codes), map roles, resolve `candidates.client` FK.
- [ ] **Dedupe: email-primary** (name secondary / manual-review), with a **`legacy_id` column** carried on every row for **idempotent upsert**.
- [ ] **Merge policy: keep-newest + flag** conflicting records for manual review (no silent overwrite).
- [ ] Load candidates (idempotent upsert on `legacy_id`) + added/skipped/errored/flagged report.
- [ ] `POST /api/migration/prepare` (preview) route.
- [ ] `POST /api/migration/commit` route (with **résumé→profile match confidence threshold + manual-confirm**).
- [ ] Port the 3-step wizard UI 1:1 (upload → preview → commit).
- [ ] Test: re-running import doesn't duplicate (upsert by `legacy_id`); email-dupes collapse; conflicts are flagged not silently merged.
- **Done-when:** all historical candidates in Postgres; report matches; re-run is safe.

### 1.4 Parity check + Sheet freeze
- [ ] **Dry-run the full import on `staging` first** (staging Supabase project) — verify counts,
      spot-check records, and fix the importer there before touching production (DECISIONS D6).
- [ ] Compare Postgres vs Sheet counts + spot-check records.
- [ ] **Read-only freeze on the candidate Sheet at final backfill** (delta re-sync then lock — no dual-run).
- [ ] Run the verified import against **production** (prod Supabase project).
- [ ] Owner sign-off → Postgres is source of truth for candidates.

---

# WAVE 2 — Core Loop + Funnel Cutover (Month 1–2)

> **Split-brain fix (D2):** the funnel cuts over **together** — Sourcing + Discover ship in this
> wave alongside the pipeline so **find → promote → pipeline** are all live on the new app at once.
> **No dual-run:** until a domain is ported, legacy writes to that domain are **frozen or redirected**
> to the new app — there is never a window where a legacy promote writes a candidate the new
> pipeline can't see.

### 2.1 Pipeline (Module 3) — brings `saved_views`  🟡 *(core board done — design `docs/design/wave-2.1-pipeline.md`; polish deferred)*
- [x] Candidate service: `move(id, toStatus)` — `STAGE_REQUIRED` gate, `stage_history` + audit, in a transaction *(shipped Wave 1.1)*.
- [x] `GET /api/candidates` — **funnel-grouped** board data + filters (track/client/search/includeTerminal).
- [x] `POST /api/candidates/:id/move` route (gated; returns only pipeline fields — no PII).
- [x] `POST /api/candidates/bulk-move` route (gated, **no bypass**, per-id txn, partial-success summary).
- [x] Kanban board + cards + drag-drop → move (dnd-kit, React 19 `useOptimistic`, snap-back + toast on `STAGE_BLOCKED`); terminal-state side rail; per-card status-`<select>` fallback (keyboard/terminal moves). Real **dashboard** (funnel bars + Total/Active/Overdue/Stuck + needs-attention + CTA) replaces the 0.3 placeholder.
- [x] Filters in URL `searchParams` (shareable). Demo-seed tooling (`pnpm db:seed:demo`, `db:status`) for local testing.
- [x] Tests: move gating (single + bulk STAGE_BLOCKED), funnel grouping, exact optimistic-revert, no-PII-on-move. Reviewed (architect→backend→frontend→review; M1 PII-over-return fixed, M2 client gate pre-check deferred w/ sign-off). **161 tests, build green.**
- [ ] **Deferred to follow-up:** table view + sortable columns; `saved_views` model + saved views + filter chips (mine/overdue/stuck/hot/verify); bulk-select UI (endpoint ships now); AI health strip (`server/ai/pipeline-health`); card scoring (needs `client_rules`); client-side gate pre-check (dim invalid targets); TanStack Query.
- **Done-when:** recruiters work candidates; gates block invalid moves; every move audited. *(Core loop ✅; legacy retirement waits on the deferred views.)*

### 2.2 Candidate Detail — notes (brings ONLY note tables)  🟡 *(notes done — mentions/outreach/ETL deferred; design `docs/design/wave-2.3-candidate-detail.md`)*
- [x] Add `candidate_notes` model → migrated (`add_candidate_notes`). *(mentions model deferred.)*
- [x] Notes service: add note (**XSS fixed** — bodies stored raw, rendered as escaped React text; `dangerouslySetInnerHTML` banned via `react/no-danger`), role-scoped visibility **server-side** (`visibleNotes`); author from the session, not the client. Audited.
- [x] `POST /api/candidates/:id/notes`, `GET .../notes` routes.
- [x] Port Notes tab (list + composer).
- [ ] **Deferred:** `mentions` model + mentions service + @mention autocomplete + notify; outreach-history panel; notes ETL backfill.
- **Done-when:** notes safe + role-scoped ✅ *(mentions/historical notes deferred)*.

### 2.3 Candidate Detail — the rest (Module 4)  🟡 *(core done — handoff deferred)*
- [x] `PATCH /api/candidates/:id` (edit, audited, `licenseNumber` gated on `viewCredentials`) + `POST .../verify-license` routes.
- [x] Header + stage-mover (client gate pre-check + server-authoritative move). Board card → **View profile** link.
- [x] Details tab (edit form) + License tab (track-aware verify) + Résumé tab (documents list; byte preview → W6).
- [x] Read layer: `getCandidateDetail` (PII-gated composite: candidate + documents + notes + stage history). Reviewed (architect→backend→frontend→review; M1 rules→`lib/rules` isomorphic move + M2 `react/no-danger` + N3 URL allowlist fixed). **253 tests, build green.**
- [ ] **Deferred:** track-editor pill; auto-handoff to Operate on "Started" (idempotency key).
- **Done-when:** full record editable ✅ *(handoff deferred)*.

### 2.4 Add Candidate (Module 5)
- [ ] `POST /api/candidates` route + zod input.
- [ ] Port add-candidate form 1:1.
- **Done-when:** manual create works + validated.

### 2.5 Cross-cutting (Module 24)
- [ ] Trash: soft-delete list + restore + purge routes; port Trash modal 1:1.
- [ ] Alerts panel (mentions + derived overdue/new/unverified) — port 1:1.
- [ ] Audit-log write helper used by every mutation.
- [ ] **Activity Log view** (`vw="activity"`) — filter by action-type + user, sort, over `activity_log`; port 1:1.
- **Done-when:** trash + alerts + activity log work; audit records actor+before/after.

### 2.6 Sourcing (Module 6) — brings ONLY lead tables *(moved up with the funnel — D2)*
- [ ] Add `source_leads` + **one `outreach_attempts`** model (nullable `lead_id` + `candidate_id`, serves both lead and candidate outreach) → migrate. *(split out of the JSON blob)*
- [ ] Lead repository + service (outreach state machine + `normalizeStatus` → codes).
- [ ] Routes (one per action): add, log-outreach, edit/delete-outreach, bulk-action, snooze, undelete.
- [ ] `POST /api/leads/:id/promote` — **the `source_lead_promote` hand-off writes the candidate to Postgres** (not the Sheet), so promote and pipeline share one store.
- [ ] `POST /api/leads/bulk-import` (chunked) route.
- [ ] **ETL: backfill leads** from the Sheet — `legacy_id` idempotent upsert, **email-primary dedupe** (name secondary/manual), keep-newest+flag merge; freeze the leads source at final backfill.
- [ ] Port inventory + filters + 5 modals 1:1.
- [ ] Port bulk actions + 30s-undo 1:1.
- **Done-when:** full lead lifecycle + promote → candidate **in Postgres**; historical leads migrated; legacy lead writes frozen/redirected.

### 2.7 Discover / NPPES (Module 7) — moved up with the funnel (find step)
- [ ] NPPES search proxy route.
- [ ] `enrich_provider_contact` (Claude) route.
- [ ] Coverage-gap query + cross-system dedupe helper (**email-primary**).
- [ ] Add-to-sourcing route.
- [ ] Port search + results table + verify links + coverage gaps 1:1.
- **Done-when:** search → dedupe → add to sourcing — all on the new app alongside promote + pipeline.

### 2.8 Inbound Triage (Sourcing/CRM) *(net-new build task — was missing)*
- [ ] Service: classify inbound applicants/replies → new-lead vs existing-candidate/lead (email-primary match + confidence + manual-confirm), suggest next action.
- [ ] Route: list inbound queue + accept/route/dismiss actions (audited).
- [ ] Port the inbound triage inbox UI 1:1 (or build minimal if no legacy view) — triage into Sourcing or the pipeline.
- **Done-when:** inbound items land in one queue and route to a lead/candidate without silent wrong-person matches.

> **Month 1–2 milestone (funnel cutover):** secure app, candidates migrated, and **find → promote →
> pipeline all live on the new app together**. **Legacy pipeline, sourcing, and discover retired.**

---

# WAVE 3 — Funnel Intelligence & Daily Loop (Month 2)

### 3.1 Daily accountability loop — Overview + Daily Log *(pulled EARLIER from the tail — D5; daily-use)*
- [ ] Add minimal `targets` + `actuals` + `daily_logs`/`journal_entries`/`journal_goals` models → migrate. *(the Daily Log slice brings its own journal models.)*
- [ ] Shared `live-actuals` + `stats-for-range` services (**one source of truth** — fixes the 3 week-defs). *(Weekly/Daily briefs in 5.1 reuse these.)*
- [ ] Port the **Overview** ("since you closed" recap + **Today's Targets**) 1:1.
- [ ] Port the **Daily Log & Journal** (self-report + auto-capture + ramps/streaks) 1:1.
- **Done-when:** the daily loop (Overview + Daily Log) runs on live data early — **it is not deferrable.**

### 3.2 Smarter Sourcing (Biruh priority #4) *(net-new — distinct from Open-Roles matching)*
- [ ] Similarity service: **"find providers like this"** — net-new similarity over an anchor candidate/lead (credential/state/population/setting), **separate** from the Open-Roles "match existing candidates to a role" flow.
- [ ] `POST /api/sourcing/similar` route.
- [ ] Port/build the "find similar" entry points (from a candidate, lead, or Discover result) → results → add-to-sourcing.
- **Done-when:** from any provider, "find providers like this" returns ranked net-new candidates to source.

### 3.3 Screening (Module 9)
- [ ] Screening scorer service (6-section weighted) + decision + auto-move.
- [ ] `POST /api/candidates/:id/screening` route.
- [ ] Port scorecard UI 1:1.
- **Done-when:** score + decision + auto-move fire.

### 3.4 License Verify — **v1 assisted verification queue** (Module 10, D4)
- [ ] Add `verification_presets` model + `LicenseExpiry` (date) on the candidate schema → migrate.
- [ ] Service: derive the **queue of candidates needing verification** + expiry timeline (uses `LicenseExpiry`).
- [ ] `POST /api/candidates/:id/verify-license` (editable status) + preset CRUD routes.
- [ ] Port the assisted queue UI 1:1: candidates-needing-verification list, **one-click state-board links**, editable status, expiry timeline.
- **Done-when:** a recruiter can work a verification queue: open the right state board in one click, set status, see expiry — status drives gates.

> **Fast-follow (clearly out of v1 scope):** real **per-state automated verification** (spike +
> per-state adapters, **partial coverage** to start). v1 is *assisted*, not *automated* — automation
> lands as a fast-follow after the queue is in use.

### 3.5 Open Roles (Module 12) — brings ONLY role tables
- [ ] Add `open_roles` + `role_notes` + `client_match_profiles` models → migrate.
- [ ] Weighted matcher + triage rank + SLA/health + dormant scorer services.
- [ ] Routes: role add/update/delete, note add/delete, match-profile save/delete, JD parse (Claude).
- [ ] Port role cards + triage strip + matches + dormant panel + modals 1:1.
- **Done-when:** roles managed; matches rank; JD auto-fill; one-click promote.

### 3.6 Credentials Intelligence (Module 25 · `vw="matrix"`) — leadership dashboard
- [ ] Service: derive verification queue (reuses 3.4), expiry buckets, credential×state coverage matrix, gap
      analysis, NLC compact-license holders, and the 6 stat cards (total/active/unverified/
      expired/expiring-<90d/NLC).
- [ ] `GET /api/credentials/overview` route.
- [ ] Port 1:1: stat cards, Verification Queue (with state-board links), License Expiry Timeline,
      credential×state coverage matrix, gap/coverage mapping, Print/PDF.
- **Done-when:** leadership sees verification queue, expiry countdowns, and coverage gaps on real data.

---

# WAVE 4 — Clients & Comms (Month 2–3)

### 4.1 Templates (Module 11)
- [ ] `fillTemplate` token engine (shared).
- [ ] Log-sent → note/outreach route.
- [ ] Port library + recipient picker + preview + send + signature editor 1:1.
- [ ] **Template Performance** (usage + response-rate analytics per template) — **in scope**: build the metric off `outreach_attempts` + reply data; port the panel 1:1.
- [ ] **Sticky Note** (quick per-user/per-record scratchpad) — **in scope**: port 1:1. *(If descoped, mark explicit v2 — do not drop silently.)*
- **Done-when:** pick → auto-fill → send → logged; template performance shows real response rates; sticky notes persist.

### 4.2 CRM (Module 13) — brings client tables incrementally, sub-feature by sub-feature
- [ ] Add `clients` model → migrate; records CRUD + Client Info tab.
- [ ] Add `client_contacts` model → migrate; contacts CRUD + UI.
- [ ] Tasks / meetings / timeline (activity-based) + UI.
- [ ] Add `deals` + `deal_blockers` models → migrate; deals CRUD + kanban UI.
- [ ] Gmail sync route + email rendering.
- [ ] **Shared email-sentiment/response scoring service (build ONCE).**
- [ ] Churn-risk analytic (uses shared scorer) + UI.
- [ ] Contact-strength + whitespace analytic (uses shared scorer) + UI.
- [ ] Deal close-probability analytic (uses shared scorer) + UI.
- [ ] Revenue/profitability + health score + compare dashboard + UI.
- [ ] AI Client Workspace route + UI.
- [ ] **ETL: backfill clients / contacts / deals** from the Sheet — `legacy_id` idempotent upsert, **email-primary dedupe** (name secondary/manual) on contacts, keep-newest+flag merge; freeze the CRM source at final backfill. *(Wave-1 minimal `clients` seed is upgraded in place, not duplicated.)*
- [ ] **ETL: reconstruct historical activity** into `activity_log` where recoverable (carry `legacy_id`).
- **Done-when:** clients managed end-to-end; historical clients/contacts/deals migrated; analytics spot-checked vs legacy.

### 4.3 Client Portal (Module 14)
- [ ] Read-only portal data route + `?portal=true` mode.
- [ ] Request-access + post-a-role routes.
- [ ] Port portal view 1:1; isolate from internal RBAC.
- **Done-when:** shareable read-only client view works.

---

# WAVE 5 — Intelligence & Admin (Month 3)

### 5.1 Briefs (Modules 15, 16) — brings brief tables
- [ ] Add `briefs` model → migrate. *(`targets`/`actuals` + the shared `live-actuals`/`stats-for-range` services already landed in 3.1 — reuse them, do not re-add.)*
- [ ] One brief engine (`server/ai/briefs`) + generate/save/patterns routes.
- [ ] Port Daily Brief + Weekly Brief 1:1. *(Overview already shipped in 3.1.)*
- **Done-when:** briefs generate off live data; numbers agree with the Overview/Daily Log from 3.1.

### 5.2 Reports + Perf + Analytics (Modules 18, 19, `vw="kpi"`)
- [ ] Report services (server-computed): executive, per-client funnel (WoW via stage_history), mass journey (Gantt), pipeline funnel, team performance, source ROI, client portfolio, time analysis, compliance.
- [ ] **Analytics view (`vw="kpi"`)**: period/user-filtered By-Status/Client/Source breakdowns, Time-to-Fill, Source-of-Hire, and **Client Capacity** (per-client capacity limits + "approaching capacity → open a new req" alert).
- [ ] CSV export route.
- [ ] Port report + analytics UIs 1:1.
- **Done-when:** all reports + analytics compute; Mass Journey renders; Client Capacity alerts; CSV exports.

### 5.3 Admin (Module 21) — brings admin tables
- [ ] Add `invites` + `access_requests` models → migrate.
- [ ] Routes: invite add/update/remove, block/unblock, reset password, approve/decline request.
- [ ] Port users / requests / roles / permission-matrix / blocked / team / audit tabs 1:1.
- **Done-when:** admin manages users + roles; RBAC changes take effect server-side.

### 5.4 Flex / risk-buffer — first to slip (D5)
> **The deferrable/flex items are CRM analytics (4.2 heavy analytics) + the heaviest reports (5.2)
> + these low-priority ports** — **never** the daily loop, pipeline, or funnel. (Daily Log & Overview
> moved to 3.1 and are *not* deferrable.)
- [ ] My Profile (avatar/bio/password/signature) — port 1:1.
- [ ] Learn tutorial — port 1:1.
- **Done-when:** each works. *(If time runs short: CRM analytics + heaviest reports flex to a fast-follow first, then these.)*

---

# WAVE 6 — Cutover & Decommission (Month 3)

- [ ] Full QA pass + fix integration bugs.
- [ ] Move résumé files to object storage (signed, expiring URLs).
- [ ] Add error tracking + structured logs; finalize audit log.
- [ ] Compliance checklist (HIPAA + Ethiopian Proclamation 1321/2024).
- [ ] Retire Apps Script + Sheet; rotate exposed credentials.
- [ ] Delete legacy `index.html`.
- **Done-when:** one secure app in production; old system off; nothing depends on Sheets.

---

## Rollout / change management
- **Per-wave recruiter UAT sign-off:** each wave ships behind a short recruiter acceptance pass on
  real workflows before the matching legacy piece is retired.
- **"Which app for which task, by month" cheat-sheet:** a living one-pager for the live users running
  both apps during migration — after the Wave 2 funnel cutover, find/promote/pipeline/sourcing/discover
  are **new app only**; CRM/reports/briefs stay on legacy until their wave lands.
- **Rollback path:** if a ported view misbehaves in production, re-point users to the frozen legacy view
  for that domain (read-only Sheet still available until its wave's final freeze), fix forward, re-cut.

## Testing (per wave)
- Unit: rules + transforms. Integration: every route incl. authz-fail. E2E: one flow per wave
  (sign-in → import → move → promote → close deal → generate brief). CI gates every PR.
- **Mandatory tests:** rules engine, authz-fail cases, migration golden-files. Best-effort elsewhere.

## Rules of thumb
- Add a table only when the feature that needs it is being built (never a big schema upfront).
- Add an endpoint only when the piece of UI that calls it is being built.
- Each checkbox is its own small PR with tests; retire the matching legacy piece when it's live.
- The three non-shrinking risks — migration, CRM analytics, Reports — get extra test time + Owner
  spot-checks. If a slip happens, the **flex items — CRM analytics + the heaviest reports (+ 5.4
  low-priority ports)** — move to a fast-follow — **never the daily loop, pipeline, or funnel.**

*Locked 2026-07-01. Companion to `ESTIMATE.md`.*
