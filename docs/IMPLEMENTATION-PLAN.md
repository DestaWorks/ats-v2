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

**Done-when (every feature):** works end-to-end on real data Â· authz enforced server-side Â· inputs
validated Â· changes audited Â· tests green Â· legacy piece retired.

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

### 0.1b Environments & domains — local Â· staging Â· production (set up early)
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
- [x] `candidates` model (simplified from the legacy 32 cols → 28 keep Â· 1 drop `TelehealthPref`→tag Â· 3 defer resume→`documents` in 1.2); status as **code** + `stageOrder` mirror + `track` + `licenseStatus` → migrated (`20260703123908_add_candidate_client_stagehistory`).
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
- [x] 3 rÃ©sumÃ© layouts (clinical/prescriber/operations).
- [x] `rÃ©sumÃ©→profile` matching (`resume.match.ts`): email-exact → auto-attach (email dedupe, D-8); name-fuzzy ≥ threshold → **manual confirm**; else new. **Server recomputes the match** and never attaches below threshold / to a non-re-matching `confirmedCandidateId` (no wrong-person PII merge). Brings the **`documents` table** (deferred from 1.1) — PII-gated DTO (`extractedData`/`extractedText` behind `viewCredentials`).
- [x] Tests: mapper, match threshold (incl. no-silent-merge + IDOR refusal), routes (auth/key-absent/mocked provider), client confirm-gate. Reviewed (architect→backend+provider-refactor→frontend→review; M1 auto/decline contract fixed). **134 tests, build green.**
- **Done-when:** ✅ upload a rÃ©sumÃ© → structured candidate data → saved; email match auto-attaches (dedupe), fuzzy match requires explicit confirm, no match creates new. *(Activates when an `AI_MODEL` provider key is set — same key-agnostic pattern as Google OAuth.)*

### 1.3 Bulk Import / Candidate ETL (Module 20)  ✅ *(done — commit `8e74eb6`, 2026-07-04; design `docs/design/wave-1.3-etl.md`)*
- [x] Importer service: parse Sheet export (CSV/JSON) — `sheet-parse.ts` (32 canonical legacy columns, required-header fail-fast).
- [x] Transform: `normalizeStatus` (→ codes), map roles, resolve `candidates.client` FK — `candidate-import.transform.ts` (`fromLegacyStatusLabel`, `normalizeClientKey`; unknown client → flagged, not auto-created).
- [x] **Dedupe: email-primary** (name secondary / manual-review), with a **`legacy_id` column** carried on every row for **idempotent upsert** — `dedupeByEmail`; `Candidate.legacyId String? @unique` (also on `Client`, `Document`).
- [x] **Merge policy: keep-newest + flag** conflicting records for manual review (no silent overwrite) — colliding rows sorted by `updatedAt`→`createdAt`→legacyId, tagged `Needs Review` + `email-duplicate`; nothing dropped.
- [x] Load candidates (idempotent upsert on `legacy_id`) + added/skipped/errored/flagged report — `candidateRepository.upsertByLegacyId` + `buildReport` (6 count buckets); re-run asserted to create zero duplicates.
- [x] `POST /api/migration/prepare` (preview) route — zero DB writes, test-verified.
- [x] `POST /api/migration/commit` route. *(The "résumé→profile match confidence threshold" phrase in the original plan line doesn't apply to this flow — bulk import attaches résumés deterministically by `legacyId`/`ResumeFileID`, since it already has an authoritative identity key; the confidence-gated fuzzy matcher is Wave 1.2's separate interactive upload flow. Formally closed as design-doc E-5, not a gap.)*
- [x] Port the 3-step wizard UI 1:1 (upload → preview → commit) — `migration-wizard.tsx` (`Stepper`, in-browser file read + sha256 checksum).
- [x] Test: re-running import doesn't duplicate (upsert by `legacy_id`); email-dupes collapse; conflicts are flagged not silently merged — `migration.service.test.ts` (46 tests total across the module, all passing).
- **Done-when:** ✅ importer built, tested, reviewed — **not yet run against the real historical export** (needs the actual Sheet file from Biruh; that one-time production run is Wave 1.4, still open below).

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

### 2.1 Pipeline (Module 3) — brings `saved_views`  🟡 *(board + list + polish done 2026-07-10, saved_views done 2026-07-15 — open: park/snooze, AI health strip)*
- [x] Candidate service: `move(id, toStatus)` — `STAGE_REQUIRED` gate, `stage_history` + audit, in a transaction *(shipped Wave 1.1)*.
- [x] `GET /api/candidates` — **funnel-grouped** board data + filters (track/client/search/includeTerminal).
- [x] `POST /api/candidates/:id/move` route (gated; returns only pipeline fields — no PII).
- [x] `POST /api/candidates/bulk-move` route (gated, **no bypass**, per-id txn, partial-success summary).
- [x] Kanban board + cards + drag-drop → move (dnd-kit, React 19 `useOptimistic`, snap-back + toast on `STAGE_BLOCKED`); terminal-state side rail; per-card status-`<select>` fallback (keyboard/terminal moves). Real **dashboard** (funnel bars + Total/Active/Overdue/Stuck + needs-attention + CTA) replaces the 0.3 placeholder.
- [x] Filters in URL `searchParams` (shareable). Demo-seed tooling (`pnpm db:seed:demo`, `db:status`) for local testing.
- [x] Tests: move gating (single + bulk STAGE_BLOCKED), funnel grouping, exact optimistic-revert, no-PII-on-move. Reviewed (architect→backend→frontend→review; M1 PII-over-return fixed, M2 client gate pre-check deferred w/ sign-off). **161 tests, build green.**
- [x] Follow-ups shipped (2026-07-07..10, PR #19): `/candidates` table view w/ server-side sort/filter/OFFSET pages; filter chips (mine/overdue/stuck/hot/needs-verification) + owner filter + hide-empty + per-column avg-days; bulk-select UI; card scoring vs `client_rules` (+ advisory auto-DQ flags); client-side gate pre-check (board select + detail MOVE-TO pills dim invalid targets).
- [x] **`saved_views` (2026-07-15):** personal, per-user saved filter combos — `SavedView` model (`scope` discriminates pipeline vs. candidates so the two incompatible URL param sets never collide; `query` is the raw `searchParams` string, not a structured/parsed shape; hard delete, no soft-delete — matches `DailyTarget`/`JournalGoal`, not `CandidateNote`/`RoleNote`). `savedViewService` (`list`/`create`/`remove`, ownership-scoped authZ — a compound `(id, userId)` delete match, `NOT_FOUND` on any mismatch so the error can't enumerate other users' ids) + `GET`/`POST /api/saved-views`, `DELETE /api/saved-views/:id`. Wired into the Pipeline board only (`SavedViewsBar`, a "+ Save view" trigger + a "VIEWS:" chip row, legacy `pSavedViews` parity but DB-backed instead of `localStorage`); the candidates-list wiring is a cheap follow-up, not built yet. 5 new tests (ownership isolation + create round-trip); full stack verified against the real dev server + Postgres (create/list/duplicate-409/delete/persist-after-reload).
- [ ] **Still deferred:** pipeline park/snooze (product decision); AI health strip (`server/ai/pipeline-health`). *(TanStack Query dropped — plain fetch + RSC re-seed proved sufficient; formalized as DECISIONS D7.)*
- **Done-when:** recruiters work candidates; gates block invalid moves; every move audited. *(Core loop + views + saved_views ✅; open: park/snooze, AI strip.)*

### 2.2 Candidate Detail — notes (brings ONLY note tables)  ✅ *(done 2026-07-10 — notes + @mentions + 5-way types + outreach tab; notes ETL deferred to 1.3; design `docs/design/wave-2.3-candidate-detail.md`)*
- [x] Add `candidate_notes` model → migrated (`add_candidate_notes`); `mentions` model → migrated (`add_mentions_expand_note_types`).
- [x] Notes service: add note (**XSS fixed** — bodies stored raw, rendered as escaped React text; `dangerouslySetInnerHTML` banned via `react/no-danger`), role-scoped visibility **server-side** (`visibleNotes`); author from the session, not the client. Audited.
- [x] `POST /api/candidates/:id/notes`, `GET .../notes` routes.
- [x] Port Notes tab (list + composer).
- [x] @mentions: server-side resolution from the stored body + mention rows w/ read state; cursor-aware autocomplete; `GET /api/mentions` + `POST /api/mentions/read`. Legacy 5-way note types restored (`internal/client/call/email/text`) with SERVER-side visibility (`viewAllNoteTypes` capability).
- [x] Candidate outreach tab (`candidate_log_outreach` parity) — merged direct + promoted-lead history, log form, tx'd counter+audit.
- [ ] **Deferred:** notes ETL backfill (goes with 1.3).
- **Done-when:** notes safe + role-scoped ✅ · mentions ✅ *(historical-notes ETL deferred)*.

### 2.3 Candidate Detail — the rest (Module 4)  🟡 *(core done — handoff blocked, see below)*
- [x] `PATCH /api/candidates/:id` (edit, audited, `licenseNumber` gated on `viewCredentials`) + `POST .../verify-license` routes.
- [x] Header + stage-mover (client gate pre-check + server-authoritative move). Board card → **View profile** link.
- [x] Details tab (edit form) + License tab (track-aware verify) + RÃ©sumÃ© tab (documents list; byte preview → W6).
- [x] Read layer: `getCandidateDetail` (PII-gated composite: candidate + documents + notes + stage history). Reviewed (architect→backend→frontend→review; M1 rules→`lib/rules` isomorphic move + M2 `react/no-danger` + N3 URL allowlist fixed). **253 tests, build green.**
- [x] **Journey timeline** (2026-07-10, PR #20): `GET /api/candidates/:id/journey` composes sourced (promoted-from lead) → promoted/created → every stage move → viewer-VISIBLE notes → merged outreach, oldest-first; "🏛 Journey" modal on the detail header (legacy CANDIDATE JOURNEY parity).
- [x] **Track-editor pill (resolved 2026-07-15):** already covered — `track` is editable in the Details-tab edit form (`updateCandidateSchema` accepts it, no capability gate beyond the general edit permission). A standalone pill (legacy had one next to the name badges) was deliberately descoped at Wave 2.3 design time (`docs/design/wave-2.3-candidate-detail.md`) and stays descoped — the form field is sufficient.
- [ ] **BLOCKED — auto-handoff to Operate on "Started":** legacy's "handoff" was a live cross-system call to a **separate, external app** (`desta-operate`, its own Google-Sheets-backed Apps Script backend) — not a module of this ATS. This codebase has no API/webhook/credential to reach Operate, and none of the product docs describe one. Cannot be built until Operate exposes an integration point Biruh can grant access to. When unblocked: `candidateService.move()` already has the natural idempotency key (`placedAt`, stamped once on first arrival at `STARTED_DAY1` — see `prisma/schema.prisma`) to guard the handoff call inside the same transaction, mirroring `leadRepository.markPromoted`'s TOCTOU-safe pattern.
- **Done-when:** full record editable ✅. Operate handoff excluded from done-when — external dependency, see BLOCKED note.

### 2.4 Add Candidate (Module 5)  ✅ *(done — legacy field order/labels restored 2026-07-11)*
- [x] `TelehealthPref` added (nullable column + select, 2026-07-11).
- [ ] **Target Locations** deferred — legacy `targetLocation` is a **Candidate** field (comma-joined `"State / City"` free text, cascading state→city picker), used ONLY to interpolate `{targetLocations}` into outreach email templates. It does **not** feed `scoreMatch`/`scoreMatchDormant`/Inbound Triage's client matcher, and legacy has **no `client_locations` table** (corrected 2026-07-14 — an earlier note here wrongly assumed a Client-side table gated on Open Roles 3.5; it isn't). Port as a nullable `Candidate.targetLocation` string column whenever outreach-template interpolation is built — not a 3.5 dependency. Legacy `contactSource` is write-only dead data — deliberately NOT ported.
- [x] `POST /api/candidates` route + `createCandidateSchema` (strict; `licenseNumber` gated on `viewCredentials`; can't set status).
- [x] Track-aware add-candidate form at `/candidates/new` (clinical/prescriber show credential+license; operations contact-only) → redirects to the new candidate detail. Entry: "+ Add candidate" on the board header.
- **Done-when:** ✅ manual create works + validated (262 tests, build green).

### 2.5 Cross-cutting (Module 24)  ✅ *(trash + activity + alerts done — retention policy decided 2026-07-14)*
- [x] Trash: soft-delete list + restore + purge routes (purge capability-gated + type-to-confirm; page at `/trash`, not a modal). *Retention decision (owner, 2026-07-14): **no auto-purge for v1** — soft-delete + the existing manual, capability-gated purge is the policy. No 30-day countdown/cron; revisit if the owner wants time-based retention later.*
- [x] Alerts panel (2026-07-10): header "Alerts" pill (badge = unread mentions only) + panel — @mentions (8 unread/3 read, mark-all-read, deep links) + derived OVERDUE / NEW TO REVIEW / VERIFICATION PENDING buckets, viewer-scoped SERVER-side via `GET /api/alerts`.
- [x] Audit-log write helper used by every mutation *(shipped Wave 0.5; used by every service mutation since)*.
- [x] **Activity Log view** (`vw="activity"`) — filter by action/entity/actor/date-range, keyset pagination, lazy before/after diff; admin-gated (`viewAudit`). *(exceeds legacy parity)*
- **Done-when:** ✅ trash + alerts + activity log work; audit records actor+before/after; trash retention policy decided (no auto-purge for v1).

### 2.6 Sourcing (Module 6) — brings ONLY lead tables *(moved up with the funnel — D2)*  🟡 *(full lifecycle done 2026-07-10 — ONLY leads ETL backfill open)*
- [x] Add `source_leads` + **one `outreach_attempts`** model (nullable `lead_id` + `candidate_id`, serves both lead and candidate outreach) → migrate. *(split out of the JSON blob)*
- [x] Lead repository + service (outreach state machine + `normalizeLeadStatus` → codes; pure `lead-lifecycle` rules).
- [x] Routes (one per action): add · log-outreach · respond · delete · restore · snooze (`snoozedUntil`, date-aware — legacy forever-snooze bug fixed) · edit/delete-outreach (lead-scoped, denorm re-sync, status never regressed) · bulk (delete/restore/status/assign/client/outreach, skips-Promoted, per-lead audit).
- [x] `POST /api/leads/:id/promote` — **the `source_lead_promote` hand-off writes the candidate to Postgres** (not the Sheet), so promote and pipeline share one store. *(409-safe against concurrent promote)*
- [x] `POST /api/leads/import` (200-row chunks; server dedupe email→name; quoted-cell CSV parser client-side).
- [ ] **ETL: backfill leads** from the Sheet — `legacy_id` idempotent upsert, **email-primary dedupe** (name secondary/manual), keep-newest+flag merge; freeze the leads source at final backfill.
- [x] Port inventory + filters (modernized: shared filter toolbar, canonical Source dropdown) + add/log/promote/delete/snooze modals + outreach-history modal (edit/delete inline).
- [x] Port bulk actions + 30s-undo 1:1 (select-all, status/assign/client/delete/log toolbar, undo = bulk restore).
- **Done-when:** full lead lifecycle + promote → candidate **in Postgres**; historical leads migrated; legacy lead writes frozen/redirected. **Open: leads ETL only.**

### 2.7 Discover / NPPES (Module 7) — moved up with the funnel (find step)  ✅ *(core flow done — 2026-07-15; Coverage Gaps/Boolean Search/contact enrichment out of scope, see below)*
- [x] NPPES search proxy route — no route needed; `/discover` is an RSC read (`discoverService.search()` calls `server/integrations/nppes.ts` directly, matching `docs/CONVENTIONS.md` §5's "RSC reads call services directly" — same pattern as `/sourcing`). Rate-limited per-user (real external-API cost/abuse surface a normal DB read doesn't have).
- [ ] **`enrich_provider_contact` — deliberately NOT built.** Turned out not to be an AI/Claude feature at all: legacy's version (`legacy/Code.gs:1613-1712`) is a Clay-webhook → Apollo.io → NPPES-phone-fallback waterfall, needing `CLAY_WEBHOOK_URL`/`APOLLO_API_KEY` that don't exist in this repo/env. **Blocked** pending those credentials from Biruh — no route, UI, or feature flag exists for it yet.
- [ ] **Coverage-gap query — out of scope for this pass** (a separate widget on the same legacy Discover page; not required by the done-when below). A natural, cheap follow-up once core flow is validated.
- [x] Cross-system dedupe helper — **NPI-primary, name-fallback** (not email-primary — NPPES results carry an NPI, not an email). Pure function `classifyDiscoverRow` (`src/lib/rules/discover-dedupe.ts`, unit-tested), checks a lead-NPI match, then a lead-name match, then a candidate-name match (candidate wins — further down the funnel). `SourceLead.npi String? @unique` added; deliberately no `Candidate.npi` (see the migration's/service's doc comments for why).
- [x] Add-to-sourcing route — `POST /api/discover/add` (`discoverService.addToSourcing`), bulk-creates via `leadRepository.createMany` with `source` forced server-side to `"NPPES"` (added to the `SOURCES` enum so it survives promote), audited, re-derives the dedupe check server-side (never trusts the client's search-time `dupStatus`).
- [x] Port search + results table + verify links 1:1 — `/discover` (nav item after Sourcing): search form (provider type/state/city/name — NPPES itself requires at least one of type/city/name, not state alone) + results table (bulk-select "new" rows, target-client picker, "Add N to Sourcing") + verify links (reused existing `stateBoardLink()`, not extended beyond its current 4 states — a separate follow-up). **Coverage gaps not ported** (see above).
- **Done-when:** ✅ search → dedupe → add to sourcing — all on the new app alongside promote + pipeline. Verified against the live NPPES API end-to-end (real provider results, NPI values, taxonomy labels rendering; insufficient-criteria and empty-query cases handled gracefully) — the add-to-sourcing *write* itself not yet exercised against the shared dev/demo DB (same caution as recent features).

### 2.8 Inbound Triage (Sourcing/CRM) *(net-new build task — was missing)*  ✅ *(done — PR #24, 2026-07-11)*
- [x] Service: classify inbound applicants/replies → new-lead vs existing-candidate/lead (email-primary match + confidence + manual-confirm), suggest next action — `inbound.service.ts` + `extract-inbound.ts` (provider-agnostic AI extraction, reuses the Wave 1.2 AI layer).
- [x] Route: list inbound queue + accept/route/dismiss actions (audited) — `src/app/api/inbound/`.
- [x] Port the inbound triage inbox UI 1:1 — `sourcing/inbound/inbound-triage.tsx` (paste reply → AI extract → dedupe → client match → Hot lead).
- **Done-when:** ✅ inbound items land in one queue and route to a lead/candidate without silent wrong-person matches.

> **Month 1–2 milestone (funnel cutover):** secure app, candidates migrated, and **find → promote →
> pipeline all live on the new app together**. **Legacy pipeline, sourcing, and discover retired.**

### Parity audit 2026-07-07 — gaps in SHIPPED modules (finalize before new waves)

A full legacy-vs-new audit (8-agent sweep of `legacy/index.html` per MODULE-BREAKDOWN ranges vs `src/**`)
found these legacy behaviors missing *inside already-shipped modules*. P0 = daily-workflow loss; P1 =
declared-deferred leftovers that still belong to the shipped surface.

**P0**
1. **License state-board links** — legacy License tab linked each state's licensing board (`LL` map + Google fallback); new tab has no link. *(the core verify workflow)*
2. **Bulk-select UI** — `POST /api/candidates/bulk-move` shipped (2.1) but no UI calls it; legacy had card/row checkboxes + "Move to stage…".
3. **Lead restore** — soft-deleted leads have no restore route/UI (legacy: 30s undo + "Show deleted" + Restore).
4. **Auto-DQ visibility** — `getAutoDisqualify` shows only on the detail scoring card; legacy flagged cards (red border + first reason) and a ⚠-count table column.
5. **Candidates-list filters** — legacy table filtered by Source, FROM/TO added-date, and view-as owner; new list has none of the three.
6. **Branded résumé output** — legacy Parse Résumé rendered a client-facing branded résumé (3 layouts, verification-line presets) with Print + Email; new flow extracts/reviews/saves only.

**P1** — Alerts panel (2.5) · @mentions + 5 note types w/ server-side role visibility (2.2) ·
sourcing bulk/snooze/outreach-edit/lead-CSV-import (2.6) · candidate outreach log surfacing
(`outreachAttempts` schema field unsurfaced) · trash 30-day countdown + auto-purge policy ·
pipeline polish (✅ owner filter · ✅ needs-verification chip · ✅ hide-empty · ✅ avg-days —
**open: park/snooze**, needs a `snoozedUntil` column + product decision).

**Deliberately NOT ported** (confirmed fine): non-idempotent Operate handoff (`op_add_provider` dup bug),
client-side note hiding (now server-side), `dangerouslySetInnerHTML` notes (XSS), `UpdatedAt`-derived
stage timing (now `stageEnteredAt`), localStorage saved views (will be `saved_views` table), naive CSV
split parser.

**Resolution 2026-07-10 (PRs #19 + #20):** all six P0s ✅ and all P1s ✅ shipped, except **trash 30-day countdown/auto-purge**
(owner policy pending) and **pipeline park/snooze** (product decision). A follow-up design-parity pass
restyled the shell + shipped pages to the legacy DESTAWORKS look (header/wordmark, navy tables, MOVE-TO
pills, Overview greeting + stacked distribution).

**Resolution 2026-07-14 (owner decision):** trash retention decided — **no auto-purge for v1**; soft-delete
+ the existing manual/capability-gated purge is the policy (no 30-day countdown, no cron). See 2.5.

**Owner escalations open:** 0.9 legacy hardening (CRITICAL, live PII), prod env (0.2/D6), OQ-0 export
format (blocks 1.3/1.4). *Trash auto-purge sign-off resolved 2026-07-14 — see above.*

---

# WAVE 3 — Funnel Intelligence & Daily Loop (Month 2)

### 3.1 Daily accountability loop — Overview + Daily Log *(pulled EARLIER from the tail — D5; daily-use)*  🟡 *(core built 2026-07-13 — see open items)*
- [x] `daily_targets` + `daily_actuals` + `daily_logs` + `journal_entries` + `journal_goals` models → migrated (`add_daily_loop_tables`). Keyed (userId, "YYYY-MM-DD") — real user ids, not legacy's synthesized emails.
- [x] Shared `lib/daily` + `dailyService.liveActuals` (**one source of truth**: Monday-anchored weeks everywhere — legacy's 3 week-defs consolidated; user-local day windows via a tz offset; sourcing = leads by `createdById`, outreach = attempts by `actorId`, cleanup = move/update/verify_license audit rows). *(`stats-for-range` minimal: `actualsForRange` — 5.1 briefs extend it.)*
- [x] Overview port: "No targets" banner (leadership gets Set-targets modal — legacy sent them to the Brief page), TODAY'S TARGETS strip (serif x/y + 9–5 pace status), End-of-Shift modal pre-filled from live actuals, "Since you closed" recap (localStorage last-seen + 30s dwell, buckets from DOMAIN tables so no audit capability needed; mentions live in the Alerts bell).
- [x] Daily Log & Journal page (`/daily-log`, nav item): tenure-ramp phase (weekNum from the USER's start date, not a hardcoded epoch) + 🔥 streak, auto-capture tiles, once-a-day self-report (409 on resubmit; autos snapshotted server-side), log history, weekly goals (REAL toggles — legacy appended duplicates), journal notes.
- [x] **Per-client sourcing breakdown (2026-07-15):** legacy never had a *display* grid for this — it was an optional input (a row of small per-client count fields) on the Daily Log self-report and the End-of-Shift modal, tracking "where sourcing effort went." Ported input-only, matching legacy exactly: `DailyActual.perClientSourcing`/`DailyLog.perClient` (JSON `{clientId:count}`, no FK, already in the schema but previously unwired) now flow through `saveActualsSchema`/`submitLogSchema` → `dailyService`. Daily Log excludes the 2 non-recruiting placeholder clients ("NJ-Psych Candidates"/"Future Potential Clients"); the EOS modal doesn't (legacy's own asymmetry, replicated intentionally). No new display/report view — that's a separate, unscoped ask if wanted later.
- [ ] **Open:** `ats_targets_suggest` AI suggest (deferred — needs the AI provider plumbing, D. AI-agnostic); 7-day trend / predictive pacing / Indeed-credit-burn / admin team-breakdown widgets; manager feedback notes.
- **Done-when:** the daily loop (Overview + Daily Log) runs on live data early — **it is not deferrable.**

### 3.2 Smarter Sourcing (Biruh priority #4) *(net-new — distinct from Open-Roles matching)*  ✅ *(done — 2026-07-16)*
- [x] Confirmed genuinely net-new (no legacy precedent — the only "similarity"-adjacent legacy code scores prospective *agency clients* for the CRM module, unrelated). Since results must be "net-new candidates to source," they come from NPPES (not our own DB); NPPES doesn't return `population`/`setting` at all, so `scoreStateSimilarity` (`lib/rules/similarity.ts`) scores the one real available dimension — state closeness (exact/NLC-compact/other, 100/60/30) — against a taxonomy-hard-filtered NPPES search.
- [x] `POST /api/sourcing/similar` → `similarityService.findSimilar()`: taxonomy lookup from the anchor's credential, nationwide NPPES search, dedupe-filtered to net-new only, scored + ranked, capped at 20.
- [x] Three "find similar" entry points, one shared `SimilarProvidersModal`: candidate detail, Discover results (per-row), Sourcing lead rows. Add-to-sourcing reuses the **existing** `POST /api/discover/add` unchanged — no new add endpoint needed.
- [x] **Found + fixed a live production bug while building this**: 5 of the 8 `TAXONOMY_OPTIONS` NPPES query strings (Discover, Wave 2.7) had *always* errored against the real NPPES API ("No taxonomy codes found") — compound "Classification, Specialization" display strings aren't valid NPPES search values. Researched and verified real working values for all 8 (`constants/nppes.ts`), plus added a required exact-match `matchDesc` post-filter (NPPES's search is loose even when it doesn't error) — applied to both Discover's search and this feature.
- **Done-when:** from any provider, "find providers like this" returns ranked net-new candidates to source. ✅

### 3.3 Screening (Module 9)  ✅ *(done — 2026-07-16)*
- [x] `scoreScreening` (6-section weighted: cred 25/state 20/exp 20/schedule 15/salary 10/comm 10) ported verbatim from `legacy/index.html:6689-6928`, pure + isomorphic (`lib/rules/screening.ts`), 27 hand-computed boundary tests.
- [x] `screening.service.ts`: `listEligibleCandidates` (scoped to the 3 eligible statuses) + `saveAndMaybeMove` — persists the scorecard (append-only `ScreeningScorecard`, new model) BEFORE attempting any move, then calls `candidateService.move()` in-process (same precedent as `bulkMove`). Server independently recomputes the score and re-validates the requested action against it — never trusts a client-submitted score.
- [x] Routes at `POST /api/screening/[candidateId]` + `GET /api/screening/candidates` (own top-level surface, not nested under `/api/candidates/:id` — matches the dedicated `/screening` page, same reasoning as Sourcing/Discover).
- [x] Scorecard UI ported 1:1 to a new `/screening` page (candidate picker + 6 pill/select sections + live client-side score preview importing `scoreScreening` directly, matching this codebase's "client mirrors for UX, server is authoritative" posture).
- [x] `ClientRules.schedule` added (was dead code in legacy — `CLIENT_RULES` had no `schedule` key, so the Schedule section's client-match branch never fired) and seeded from real legacy `STATIC_DATA` values (Sterling Institute/Contemporary Care → "Hybrid", DOCs Medical Group → "3x12hr shifts", Ritu Suri & Associates → "Flexible"). Per `docs/DECISIONS.md` ("known client defects are corrected, not ported").
- [x] **Deviation from spec, by explicit choice:** *auto-move* → **legacy-faithful conditional button** instead (Save always visible; Advance shown only at ≥75%; Move to Future Pipeline shown only at <60%) — matches legacy's own click-to-move UX and this app's existing "advisory only, nothing happens automatically" precedent (`ScoringCard`).
- **Done-when:** score + decision compute live in the UI; Save/Advance/Move-to-Future-Pipeline fire the right server-authoritative outcome. ✅

### 3.4 License Verify — **v1 assisted verification queue** (Module 10, D4)  ✅ *(done — 2026-07-16)*
- [x] Schema/gates/status-edit were **already shipped** from earlier waves: `Candidate.licenseState/licenseNumber/licenseStatus/licenseExpiry/licenseVerifiedAt/licenseVerifiedById`, `LICENSE_STATUSES`, `POST /api/candidates/:id/verify-license` + `candidateService.verifyLicense()`, the `LicenseTab` UI, and `checkStageGate`/`STAGE_REQUIRED` already gating INITIAL_SCREENING/SUBMITTED_TO_CLIENT on `licenseStatus`. No migration was needed for this wave.
- [x] `licenseVerifyService.dashboard()` derives the **Verification Queue** (`licenseStatus: "Not Verified"`) + **License Expiry Timeline** (`Active` + `licenseExpiry` set, soonest-first, `daysLeft`/color bucket) — ported from `legacy/index.html:3001-3037`, verbatim filter/sort logic. New `/license-verify` page (read-only RSC — legacy's own queue has no inline verify form either; it launches into the same detail-page verify flow this app already has).
- [x] **One-click state-board links**: widened `STATE_BOARDS` from 4 to 13 states (added NY/PA/CA/TX/OH/VA/MD/GA/NC, ported from legacy's `BOARD_LINKS` map) — shared with the existing `LicenseTab`.
- [x] **Deviation from spec, by explicit choice:** dropped the `verification_presets` bullet — legacy's actual `Client_Verification_Presets` feature is per-client canned text for the branded résumé's "Verification Line" (Module 7, unrelated to license-status verification at all). Deferred to whenever branded résumé output is scoped.
- **Done-when:** a recruiter can work a verification queue: open the right state board in one click, set status, see expiry — status drives gates. ✅

> **Fast-follow (clearly out of v1 scope):** real **per-state automated verification** (spike +
> per-state adapters, **partial coverage** to start). v1 is *assisted*, not *automated* — automation
> lands as a fast-follow after the queue is in use.

### 3.5 Open Roles (Module 12) — brings ONLY role tables  ✅ *(done — PR #25, 2026-07-14)*
- [x] Add `open_roles` + `role_notes` + `client_match_profiles` models → migrate (`20260714170402_add_open_roles`).
- [x] Weighted matcher (client-tunable) + triage-strip ranker + fixed-weight dormant re-engagement scorer — 3 distinct scoring engines ported from the legacy source, pure + unit-tested in `lib/rules/role-matching.ts`. *(No separate "SLA/health" module — staleness is one term inside the triage-strip formula, matching legacy; there's no independent health-state enum.)*
- [x] Routes: role CRUD + notes CRUD + matches/dormant-matches reads + promote + triage + match-profile CRUD + JD parse (provider-agnostic, not Claude-only — reuses the Wave 1.2/2.8 AI layer).
- [x] `/roles` (table, matching `candidates-list.tsx`'s pattern — not cards) + triage strip + `/roles/:id` (matches/dormant/notes tabs + inline edit).
- [x] **Deviation from legacy (deliberate):** promoted candidates get a real `filledFromRoleId` FK instead of legacy's `"FilledFromRole:R123"` tags-string hack.
- **Done-when:** ✅ roles managed; matches rank; JD auto-fill; one-click promote.

> **Maintenance — DRY/code-standard audit (PR #26, 2026-07-15).** A full-codebase audit after
> 3.5 (repositories, services, validation, client fetch code, docs) found and fixed: a `db(tx)`
> transaction helper reimplemented in 13 repositories → one shared helper; an id→name `Map`
> rebuilt at 14 call sites → `clientRepository.nameMap()`; 3 duplicated offset-pagination
> implementations → shared `PageMeta`/`pageMeta()` + a shared `<Pager>` component; 6 duplicated
> `emptyToNull`/`emptyToNullNumber` form helpers → one shared pair; an **N+1 fix** on Open
> Roles (`matches`/`dormantMatches`/`triage` each independently full-table-scanned every lead
> with every column — now a lean `select`-only read, and `/roles/[id]` fetches leads once
> instead of twice per page load via a new `matchesAndDormant()`); `lib/api/client.ts` gained
> `patchJson`/`putJson`/`deleteJson` and 5 hand-rolled `fetch()` call sites were migrated onto
> them; Sourcing's bespoke filter card was migrated onto the shared `FilterToolbar` primitives
> already used by Candidates/Pipeline/Roles. Also resolved a real doc/reality gap found during
> the audit: `docs/DECISIONS.md`/`STACK-ARCHITECTURE.md` had locked in TanStack Query as the
> server-state layer, but every wave since 0.6 actually shipped RSC reads + `lib/api/client.ts`'s
> typed `ApiResult<T>` helpers instead (TanStack Query was never installed) — **formalized as
> DECISIONS D7**, docs updated to match reality rather than the unbuilt original plan.

### 3.6 Credentials Intelligence (Module 25 · `vw="matrix"`) — leadership dashboard  ✅ *(done — 2026-07-17)*
- [x] `credentialsIntelligenceService.overview()`: 6 stat cards (fresh uncapped aggregate counts —
      NOT derived from 3.4's capped queue/timeline), a credential×state coverage matrix (DATA-DRIVEN
      rows/columns, not legacy's hardcoded 6-state/12-credential subset — real data already spans
      more states/credentials), client×credential gap analysis (`stageOrder < FIRST_TERMINAL_ORDER`,
      matching 3.4's "active work" convention, not legacy's looser filter), and an NLC compact-license
      tracker (reconciled to the app-wide 37-state `COMPACT_STATES`, not legacy's inconsistent
      34-state module-local list).
- [x] `GET /api/credentials/overview` route, gated `requireCapability("viewCredentials")`.
- [x] New `/credentials` page (leadership-only, `viewCredentials`-gated like the License tab):
      stat cards, coverage matrix (4-tier color legend + red GAP cells), gap-analysis card grid,
      NLC tracker, Print/PDF (`window.print()`, reusing the already-built `.no-print` baseline).
- [x] **Deviation from spec, by explicit choice:** does NOT re-render the Verification Queue /
      Expiry Timeline tables a second time (already fully built at `/license-verify`, Wave 3.4) —
      this dashboard summarizes via the stat cards + "N need attention → View full queue" links
      instead, avoiding two pages showing identical data. Legacy's Bulk Actions (Mark All
      Active/Move Expired) and Client Match Summary sections dropped — WRITE actions and score
      recompute, not part of this wave's own task list.
- **Done-when:** leadership sees verification queue, expiry countdowns, and coverage gaps on real data. ✅

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
- [ ] Move rÃ©sumÃ© files to object storage (signed, expiring URLs).
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
