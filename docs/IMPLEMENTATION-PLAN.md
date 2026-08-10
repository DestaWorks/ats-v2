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
- [x] Port request-access (writes `access_requests` via service → repository) 1:1. **Forgot-password screen still deferred** — the original blocker (no email transport) is now resolved: `server/email/{config,provider}.ts` (2026-08-02) wraps Nodemailer, provider-agnostic via SMTP env vars (`EMAIL_HOST`/`PORT`/`SECURE`/`USER`/`PASS`/`FROM`), staging wired to Ethereal (https://ethereal.email — a fake SMTP catcher, view sent mail at ethereal.email/messages, nothing reaches a real inbox), verified live end-to-end (`sendEmail()` → real Ethereal preview URL). Production still needs a real SMTP provider chosen (swap the 5 env vars, no code change). The screen itself is still not built — tracked for a later Wave 0 slice.
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
- [x] **Also audited the NEW app** (`src/`, 2026-07-17, 5-dimension parallel review) — full findings: `docs/SECURITY-AUDIT-APP.md`. Much more disciplined than legacy (every one of 60 API routes has a real server-side auth check, role is verifiably server-controlled, no SQL injection/XSS/secret-leak findings) but **one CRITICAL gap**: Google OAuth sign-in has no `disableSignUp` guard, so anyone with a Google account can self-register a live account — compounded by the app's by-design "any authenticated user can read any record" model, this amounts to an open door to the full PHI database via a one-click signup. Also found: the audit log permanently bypasses field-level encryption (plaintext PII in `activity_log` forever, even after key rotation), `FIELD_ENCRYPTION_KEY` isn't set in production at all, no password-reset flow exists, and a dev script defaults to real-looking prod credentials with no environment guard. Full severity breakdown + ordered remediation in the doc.
- [x] Fix the new app's CRITICAL finding (Google OAuth self-registration) — `socialProviders.google.disableSignUp: true` added in `src/server/auth/auth.ts`, closing the open-signup gap; existing Google-linked accounts are unaffected.
- [x] Fix new-app HIGH findings H1/H5/H7 + partial H4, and MEDIUM/LOW findings M2/L6 (2026-07-18) — audit-log PII redaction, rate limiting on the two AI routes, a capability gate on the role hard-delete, an environment guard + required args on the password-reset script, and baseline security headers/CSP. Full detail + remaining owner-decision items (H2 encryption key, H3 password-reset flow, H6 persistent rate-limit store) in `docs/SECURITY-AUDIT-APP.md`'s Status section.
- **Done-when:** the live app rejects unauthenticated/unauthorized calls. *(Gap is now documented + escalated per the fallback done-when; the fix lands once the owner greenlights changes to the live Apps Script. New-app findings similarly documented + escalated, pending owner prioritization.)*

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
- [x] `POST /api/migration/commit` route. *(The "resume→profile match confidence threshold" phrase in the original plan line doesn't apply to this flow — bulk import attaches resumes deterministically by `legacyId`/`ResumeFileID`, since it already has an authoritative identity key; the confidence-gated fuzzy matcher is Wave 1.2's separate interactive upload flow. Formally closed as design-doc E-5, not a gap.)*
- [x] Port the 3-step wizard UI 1:1 (upload → preview → commit) — `migration-wizard.tsx` (`Stepper`, in-browser file read + sha256 checksum).
- [x] Test: re-running import doesn't duplicate (upsert by `legacy_id`); email-dupes collapse; conflicts are flagged not silently merged — `migration.service.test.ts` (46 tests total across the module, all passing).
- [x] **Indrasur bulk-resume flow** ✅ *(done 2026-07-29 — a later, separate addition; see
      `docs/design/wave-1.3-etl.md` §5.1)* — an optional resume ZIP alongside the CSV/JSON,
      matched to rows by name (client-side unzip + pdf.js text extraction, same as the Wave 1.2
      single-resume flow — no binary ever reaches the server), and an opt-in AI-extraction step
      reusing Wave 1.2's real `parseResume` schema. Fixes 3 confirmed legacy bugs rather than
      porting them: filename collisions are surfaced as `"ambiguous"` (never a silent overwrite);
      a row with no matched resume still imports (never hard-blocked, unlike legacy's
      `matchedFile`-required commit filter); AI failures mark the row `"ai-extraction-failed"`
      instead of silently succeeding with blank fields (legacy's own field-harvesting read schema
      keys its Gemini call never produced, swallowed by a triple-nested try/catch). Unmatched
      resume files are always listed in the report, never silently dropped.
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

### 2.1 Pipeline (Module 3) — brings `saved_views`  🟡 *(board + list + polish done 2026-07-10, saved_views done 2026-07-15, AI health strip + saved_views-on-candidates done 2026-07-24 — open: park/snooze)*
- [x] Candidate service: `move(id, toStatus)` — `STAGE_REQUIRED` gate, `stage_history` + audit, in a transaction *(shipped Wave 1.1)*.
- [x] `GET /api/candidates` — **funnel-grouped** board data + filters (track/client/search/includeTerminal).
- [x] `POST /api/candidates/:id/move` route (gated; returns only pipeline fields — no PII).
- [x] `POST /api/candidates/bulk-move` route (gated, **no bypass**, per-id txn, partial-success summary).
- [x] Kanban board + cards + drag-drop → move (dnd-kit, React 19 `useOptimistic`, snap-back + toast on `STAGE_BLOCKED`); terminal-state side rail; per-card status-`<select>` fallback (keyboard/terminal moves). Real **dashboard** (funnel bars + Total/Active/Overdue/Stuck + needs-attention + CTA) replaces the 0.3 placeholder.
- [x] Filters in URL `searchParams` (shareable). Demo-seed tooling (`pnpm db:seed:demo`, `db:status`) for local testing.
- [x] Tests: move gating (single + bulk STAGE_BLOCKED), funnel grouping, exact optimistic-revert, no-PII-on-move. Reviewed (architect→backend→frontend→review; M1 PII-over-return fixed, M2 client gate pre-check deferred w/ sign-off). **161 tests, build green.**
- [x] Follow-ups shipped (2026-07-07..10, PR #19): `/candidates` table view w/ server-side sort/filter/OFFSET pages; filter chips (mine/overdue/stuck/hot/needs-verification) + owner filter + hide-empty + per-column avg-days; bulk-select UI; card scoring vs `client_rules` (+ advisory auto-DQ flags); client-side gate pre-check (board select + detail MOVE-TO pills dim invalid targets).
- [x] **`saved_views` (2026-07-15):** personal, per-user saved filter combos — `SavedView` model (`scope` discriminates pipeline vs. candidates so the two incompatible URL param sets never collide; `query` is the raw `searchParams` string, not a structured/parsed shape; hard delete, no soft-delete — matches `DailyTarget`/`JournalGoal`, not `CandidateNote`/`RoleNote`). `savedViewService` (`list`/`create`/`remove`, ownership-scoped authZ — a compound `(id, userId)` delete match, `NOT_FOUND` on any mismatch so the error can't enumerate other users' ids) + `GET`/`POST /api/saved-views`, `DELETE /api/saved-views/:id`. Wired into the Pipeline board only (`SavedViewsBar`, a "+ Save view" trigger + a "VIEWS:" chip row, legacy `pSavedViews` parity but DB-backed instead of `localStorage`); the candidates-list wiring is a cheap follow-up, not built yet. 5 new tests (ownership isolation + create round-trip); full stack verified against the real dev server + Postgres (create/list/duplicate-409/delete/persist-after-reload).
- [x] **AI Pipeline Health strip** ✅ *(done 2026-07-24, Wave 5.5 backlog, legacy Drop 53
      `ats_pipeline_health`)* — `server/ai/pipeline-health/pipeline-health.ts` (same `generateAi`
      pattern as Daily/Weekly Brief), `POST /api/pipeline/health` (`requireUser()` only,
      rate-limited), a strip above the board (`pipeline/health-strip.tsx`) auto-fetching once on
      mount + a manual refresh, color-coded 0-40/40-70/70-100 per legacy's own rubric. Context:
      team-wide active/overdue/stuck counts (same predicates `listBoard`'s `meta` already used) +
      a new `candidateRepository.topOverdue` (top-5 longest-in-stage, team-wide not per-owner).
- [x] **`saved_views` on `/candidates`** ✅ *(done 2026-07-24)* — the schema/service/routes/UI
      component were already scope-generic (built for exactly this reuse in the 2026-07-15 pass);
      wired `SavedViewsBar scope="candidates"` into `candidates/page.tsx`, zero service changes.
- [ ] **Still deferred:** pipeline park/snooze (product decision). *(TanStack Query dropped — plain
  fetch + RSC re-seed proved sufficient; formalized as DECISIONS D7.)*
- **Done-when:** recruiters work candidates; gates block invalid moves; every move audited. *(Core
  loop + views + saved_views (both scopes) + AI health strip ✅; open: park/snooze.)*

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
- [x] **Target Locations** ✅ *(done 2026-07-24, Wave 5.5 backlog)* — legacy `targetLocation` is a
      **Candidate** field, used ONLY to interpolate `{targetLocations}` into outreach email
      templates (now built, Wave 4.1). Read `legacy/index.html:9341` directly before porting:
      legacy's "cascading state→city picker" turned out to be a tiny hardcoded 5-client
      office-list, not a real dataset — and the field was actually **write-only/dead** in the
      current legacy source (`ats_add_candidate` never persisted it). Ported as a plain nullable
      `Candidate.targetLocation` free-text column (matching the actual comma-joined stored shape,
      not the fake cascade UI) — `createCandidateSchema`/`updateCandidateSchema`, both candidate
      forms, `CandidateProfileDTO`, and `adaptCandidateToRecipient` (`{targetLocations}` was
      already a wired fallback-safe token — `fillTemplate` itself needed no changes). It does
      **not** feed `scoreMatch`/`scoreMatchDormant`/Inbound Triage's client matcher. Legacy
      `contactSource` is write-only dead data — deliberately NOT ported.
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

### 2.7 Discover / NPPES (Module 7) — moved up with the funnel (find step)  ✅ *(core flow done — 2026-07-15; coverage gaps done 2026-07-24; Boolean Search/contact enrichment out of scope, see below)*
- [x] NPPES search proxy route — no route needed; `/discover` is an RSC read (`discoverService.search()` calls `server/integrations/nppes.ts` directly, matching `docs/CONVENTIONS.md` §5's "RSC reads call services directly" — same pattern as `/sourcing`). Rate-limited per-user (real external-API cost/abuse surface a normal DB read doesn't have).
- [ ] **`enrich_provider_contact` — deliberately NOT built.** Turned out not to be an AI/Claude feature at all: legacy's version (`legacy/Code.gs:1613-1712`) is a Clay-webhook → Apollo.io → NPPES-phone-fallback waterfall, needing `CLAY_WEBHOOK_URL`/`APOLLO_API_KEY` that don't exist in this repo/env. **Blocked** pending those credentials from Biruh — no route, UI, or feature flag exists for it yet.
- [x] **Coverage-gap widget** ✅ *(done 2026-07-24, Wave 5.5 backlog, legacy Drop 68 "Coverage
      Gaps")* — a collapsible section above the search form (`discover/coverage-gaps.tsx`): open
      `OpenRole`s grouped by (credential, state) vs. sourced (`SourceLead`) + pipeline
      (`Candidate`) counts (`discoverService.coverageGaps`, RSC-direct, no self-fetch — matches
      the search's own pattern; 3 grouped repo queries joined in-memory, not one query per combo).
      NPPES supply stays **lazy/on-demand per row** (`GET /api/discover/coverage-gaps/supply`,
      rate-limited, reuses `taxonomyForCredential`/`searchNppes`) rather than firing on page load —
      legacy's 7-day client cache wasn't worth replicating for a first cut. `gap = max(0, supply -
      pool - pipeline)`, capped at NPPES's own 50-result limit, matching legacy's cap.
- [x] Cross-system dedupe helper — **NPI-primary, name-fallback** (not email-primary — NPPES results carry an NPI, not an email). Pure function `classifyDiscoverRow` (`src/lib/rules/discover-dedupe.ts`, unit-tested), checks a lead-NPI match, then a lead-name match, then a candidate-name match (candidate wins — further down the funnel). `SourceLead.npi String? @unique` added; deliberately no `Candidate.npi` (see the migration's/service's doc comments for why).
- [x] Add-to-sourcing route — `POST /api/discover/add` (`discoverService.addToSourcing`), bulk-creates via `leadRepository.createMany` with `source` forced server-side to `"NPPES"` (added to the `SOURCES` enum so it survives promote), audited, re-derives the dedupe check server-side (never trusts the client's search-time `dupStatus`).
- [x] Port search + results table + verify links 1:1 — `/discover` (nav item after Sourcing): search form (provider type/state/city/name — NPPES itself requires at least one of type/city/name, not state alone) + results table (bulk-select "new" rows, target-client picker, "Add N to Sourcing") + verify links (reused existing `stateBoardLink()`, not extended beyond its current 4 states — a separate follow-up).
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
6. **Branded resume output** — legacy Parse Resume rendered a client-facing branded resume (3 layouts, verification-line presets) with Print + Email; new flow extracts/reviews/saves only.

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

### 3.1 Daily accountability loop — Overview + Daily Log *(pulled EARLIER from the tail — D5; daily-use)*  ✅ *(core built 2026-07-13; remaining widgets done 2026-07-24)*
- [x] `daily_targets` + `daily_actuals` + `daily_logs` + `journal_entries` + `journal_goals` models → migrated (`add_daily_loop_tables`). Keyed (userId, "YYYY-MM-DD") — real user ids, not legacy's synthesized emails.
- [x] Shared `lib/daily` + `dailyService.liveActuals` (**one source of truth**: Monday-anchored weeks everywhere — legacy's 3 week-defs consolidated; user-local day windows via a tz offset; sourcing = leads by `createdById`, outreach = attempts by `actorId`, cleanup = move/update/verify_license audit rows). *(`stats-for-range` minimal: `actualsForRange` — 5.1 briefs extend it.)*
- [x] Overview port: "No targets" banner (leadership gets Set-targets modal — legacy sent them to the Brief page), TODAY'S TARGETS strip (serif x/y + 9–5 pace status), End-of-Shift modal pre-filled from live actuals, "Since you closed" recap (localStorage last-seen + 30s dwell, buckets from DOMAIN tables so no audit capability needed; mentions live in the Alerts bell).
- [x] Daily Log & Journal page (`/daily-log`, nav item): tenure-ramp phase (weekNum from the USER's start date, not a hardcoded epoch) + 🔥 streak, auto-capture tiles, once-a-day self-report (409 on resubmit; autos snapshotted server-side), log history, weekly goals (REAL toggles — legacy appended duplicates), journal notes.
- [x] **Per-client sourcing breakdown (2026-07-15):** legacy never had a *display* grid for this — it was an optional input (a row of small per-client count fields) on the Daily Log self-report and the End-of-Shift modal, tracking "where sourcing effort went." Ported input-only, matching legacy exactly: `DailyActual.perClientSourcing`/`DailyLog.perClient` (JSON `{clientId:count}`, no FK, already in the schema but previously unwired) now flow through `saveActualsSchema`/`submitLogSchema` → `dailyService`. Daily Log excludes the 2 non-recruiting placeholder clients ("NJ-Psych Candidates"/"Future Potential Clients"); the EOS modal doesn't (legacy's own asymmetry, replicated intentionally). No new display/report view — that's a separate, unscoped ask if wanted later.
- [x] `ats_targets_suggest` AI suggest ✅ *(done 2026-07-23, Wave 5.1 — the AI-provider plumbing this was deferred pending now exists; `POST /api/targets/suggest` + the "✨ AI Suggest" button on the manager target-setting modal, `dashboard/daily-strip.tsx`.)*
- [x] **Predictive pacing + 7-day trend** ✅ *(done 2026-07-24)* — `lib/daily.ts::weeklyPacing`
      (linear projection of the rolling Monday-anchored week's self-reported sourcing vs. the
      daily ramp target) + a zero-filled 7-day bar chart, both on `/daily-log`. No schema change
      — reuses `logsForUser`'s already-fetched history.
- [x] **Admin team breakdown** ✅ *(done 2026-07-24)* — a `viewReports`-gated per-associate
      weekly rollup (`GET /api/daily/team-breakdown`), built from real self-reported `DailyLog`
      rows across all users (matches legacy's own inputs — NOT event-derived live counts).
      Legacy's "quality %" column (advanced-past-status-index-3 ratio) deliberately NOT ported —
      a second, heavier query for a number legacy itself buried in a table cell; a cheap
      follow-up if actually wanted.
- [x] **Manager feedback** ✅ *(done 2026-07-24, legacy `mgr_feedback`)* — new `ManagerFeedback`
      model (append-only, mirrors `JournalEntry` — legacy repurposed an unrelated field to fake
      this; nothing backed it before). `POST /api/daily/manager-feedback` (`viewReports`-gated,
      same tier as target-setting), last 2 shown on the recipient's own Daily Log page.
- [x] **"Indeed credit burn" — deliberately NOT ported.** Traced to legacy source: it's the
      generic `outreach` self-report number relabeled, checked against a hardcoded, unconfigured
      "100/month" cap — zero backend/`Code.gs` support anywhere for real Indeed credits. Porting
      it as-is would just relocate a fake metric; skipped per owner confirmation.
- **Done-when:** the daily loop (Overview + Daily Log) runs on live data early — **it is not deferrable.** ✅

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
- [x] **Deviation from spec, by explicit choice:** dropped the `verification_presets` bullet — legacy's actual `Client_Verification_Presets` feature is per-client canned text for the branded resume's "Verification Line" (Module 7, unrelated to license-status verification at all). Deferred to whenever branded resume output is scoped.
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

### 4.1 Templates (Module 11)  ✅ *(done — 2026-07-20)*
- [x] `fillTemplate` token engine (shared) — `src/lib/rules/fill-template.ts`, all 33 legacy tokens
      + `{today}` (new — see file header comment), pure/isomorphic.
- [x] Log-sent → note/outreach route — reuses the EXISTING `POST /api/candidates/:id/outreach` +
      `POST /api/leads/:id/outreach` (both already shared one `logOutreachSchema`, now extended
      with an optional `templateId`); no new route needed. Deliberate improvement over legacy:
      candidate-side sends log through the same unified `outreach_attempts` table as leads (legacy
      inconsistently split candidate→note vs lead→outreach), which is what makes Template
      Performance work for both recipient types instead of legacy's lead-only analytics.
- [x] Port library + recipient picker + preview + send + signature editor 1:1 —
      `src/lib/constants/templates.ts` (12 templates, 5 categories, verbatim from legacy), 
      `src/app/(app)/templates/` (page + workspace + signature editor).
- [x] **Template Performance** — `src/server/services/template-performance.service.ts` +
      `GET /api/templates/performance` (gated `viewAnalytics`, diverges from legacy's flat access —
      matches this app's established analytics-gating convention). Response-rate is lead-only
      (candidates have no "responded" concept in this schema); `leadService.respond()` auto-
      backfills `response`/`respondedAt` on the most recent unresponded attempt when a lead is
      marked Hot/Cold, automating what legacy required a fully manual edit for.
- [x] **Sticky Note** — `src/components/sticky-note.tsx`, DB-backed (`User.stickyNote`) instead of
      legacy's `localStorage`, same one-global-scratchpad-per-user UX. Signature is DB-backed too
      (`User.emailSignature`) — fixes a real legacy bug where the signature's `localStorage` key had
      no user scoping at all (shared-browser users clobbered each other's signature).
- **Done-when:** ✅ pick → auto-fill → send → logged (verified: real DB round-trip on the new
  `OutreachAttempt.templateId`/`response`/`respondedAt` + `User.emailSignature`/`stickyNote`
  columns); template performance computes real response rates; sticky notes + signature persist
  server-side. 777/777 tests green, `next build` clean. **Not yet verified in a live browser this
  session** (no interactive/browser tool available) — recommend a manual click-through pass
  (recipient search, Copy All / Open in Gmail logging, signature/sticky-note persistence across a
  reload, Hot/Cold auto-backfill) before/soon after this reaches production.

### 4.2 CRM (Module 13) — brings client tables incrementally, sub-feature by sub-feature
- [x] Add `clients` model → migrate; records CRUD + Client Info tab ✅ *(slice 1, done 2026-07-23)*
      — real profile columns (contact/location/priority/cadence/schedule/contractStart/
      renewalDate/states/specialties/services) replacing legacy's activity-log-reconstruction
      storage; `/crm` list + `/crm/:id` detail/edit, gated `viewCrm` (leadership, matches legacy's
      `!isLeadership` CRM redirect). "Roles Needed" / legacy's in-CRM Open Roles tab intentionally
      NOT ported — superseded by the real `OpenRole` table (Wave 3.5); the client detail page
      links out to `/roles?clientId=X` instead.
- [x] Add `client_contacts` model → migrate; contacts CRUD + UI ✅ *(slice 1, done 2026-07-23)*
      — full field set (fullName/title/role/email/phone/linkedin/reportsTo/status/notes),
      add/edit/mark-departed/soft-delete, on the same `/crm/:id` page. Per-contact **strength
      score**, champion/detractor classification, and **whitespace detection** deliberately
      deferred — both depend on Gmail-synced email data that doesn't exist until the Gmail-sync
      sub-task below lands.
- [x] Tasks / meetings / timeline (activity-based) + UI ✅ *(slice 2, done 2026-07-23)* — real
      `ClientTask` (mutable `status`/`completedAt`) and `ClientMeeting` (append + soft-delete-only,
      no edit — legacy's Meetings tab genuinely is immutable, unlike Tasks) tables; legacy's Tasks
      "mark done" is a real bug (appends a second, independent activity-log row instead of
      updating anything, so the "Open Tasks" filter never shrinks) — not ported. Timeline is a
      capped (40), read-time aggregation composed from Task/Meeting/Contact/Client data, not
      sourced from the generic `activity_log` (whose `entityId` doesn't carry a `clientId`) and
      not unbounded like legacy's equivalent tab.
- [x] Add `deals` + `deal_blockers` models → migrate; deals CRUD + kanban UI ✅ *(slice 3, done
      2026-07-23)* — real `Deal` (5 open kanban stages + Signed/Lost, `closedAt`/`closeReason`/
      `postMortem` on close) + real `DealBlocker` table (upgrading legacy's JSON-blob `Blockers`
      column). **No computed close-probability this slice** — legacy's `dealProbability()` needs
      Gmail-synced sentiment data for its "stakeholder relationship scoring" term (the same
      reimplemented-3× scan the shared-scorer bullet below exists to consolidate); only legacy's
      own manual `probabilityOverride` field is ported. Stakeholder linking also deferred (its only
      value is feeding that same deferred formula). Confirmed legacy bug NOT ported: deal recency
      scans ALL of a client's `crm_*` activity (any task/meeting/contact/other-deal touch), so the
      same inflated score applies to every deal card — moot for now since no score is computed,
      but the later probability slice should use `deal.updatedAt` instead.
- [ ] Gmail sync route + email rendering. *(Needs Biruh's decisions first: whose account syncs,
      OAuth app/consent-screen setup, PII/retention posture — flagged, not started.)*
- [ ] **Shared email-sentiment/response scoring service (build ONCE).** *(Depends on Gmail sync.)*
- [ ] Churn-risk analytic (uses shared scorer) + UI. *(Depends on the shared scorer.)*
- [ ] Contact-strength + whitespace analytic (uses shared scorer) + UI. *(Depends on the shared scorer.)*
- [ ] Deal close-probability analytic (uses shared scorer) + UI. *(Depends on the shared scorer.)*
- [x] **Revenue/profitability + Health Score + Compare dashboard** ✅ *(done 2026-07-24 — confirmed
      via research this does NOT depend on Gmail/the shared scorer.)* Added `Client.monthlyRate`/
      `avgPlacementFee`/`grossMargin` + a new `ClientNote` model (a real gap: Health Score's
      "communication recency" factor and Compare's "Last Contact" column both needed a manual
      call/note log legacy calls `crm_note`, which this rebuild never had — filled it, not
      worked around it). **Fixed, not ported**: legacy computed client health 3 DIFFERENT,
      independently-drifted ways (Overview tab, Compare's own "Quick Health," and a separate
      Churn-Risk %) — `lib/rules/client-health.ts`'s `computeHealthScore()` is now the ONE
      formula both the detail page and Compare call (verified live: identical score for the same
      client from both endpoints). Deliberately **dropped legacy's 4th "onboarding steps"
      factor** (reweighted to 3: pipeline/communication/tasks) — that data source is a
      checklist concept never built in this rebuild and never asked for in this plan; inventing
      a whole onboarding subsystem just to satisfy one formula term was out of scope.
      Revenue's `hoursInvested` proxy is scoped to REAL touch tables (notes/tasks/meetings/deals)
      rather than a generic activity-log scan, so it stays accurate once Gmail sync lands later
      (won't silently inflate from auto-pulled emails). New `/crm/compare` page + Health/AI-
      Workspace tabs on `/crm/:id`.
- [x] **AI Client Workspace** ✅ *(done 2026-07-24 — confirmed via research this is only a SOFT
      dependency on Gmail: it reads Gmail-sourced sentiment/summary fields as optional context
      when present, but degrades gracefully to zero Gmail data today.)* Legacy called raw Gemini
      REST directly (`Code.gs:4694-4843` — the exact anti-pattern Wave 5.1 already fixed for
      Daily/Weekly Brief); ported through the same `generateStructured()`/`AppError`-mapping
      wrapper instead. That wrapper (`generateBrief` → renamed `generateAi`) was relocated from
      `ai/briefs/shared.ts` to `ai/shared.ts` since it's now used by 2 unrelated modules, not
      brief-specific. "Log to CRM" writes a REAL `ClientNote` row — legacy's version wrote a
      truncated, stringly-typed activity-log blob.
- [ ] **ETL: backfill clients / contacts / deals** from the Sheet — `legacy_id` idempotent upsert, **email-primary dedupe** (name secondary/manual) on contacts, keep-newest+flag merge; freeze the CRM source at final backfill. *(Wave-1 minimal `clients` seed is upgraded in place, not duplicated.)*
- [ ] **ETL: reconstruct historical activity** into `activity_log` where recoverable (carry `legacy_id`).
- **Done-when:** clients managed end-to-end ✅; contacts managed end-to-end ✅; tasks/meetings/
  timeline managed end-to-end ✅; deals managed end-to-end ✅ (kanban CRUD; probability analytic
  deferred to the shared-scorer slice below); Revenue/Health-Score/Compare ✅; AI Client
  Workspace ✅; historical clients/contacts/deals migrated ⬜; the Gmail-dependent chain
  (sentiment scorer, churn-risk, contact-strength/whitespace, deal-probability) remains the
  ONLY open flex work in this wave, gated on Biruh's Gmail/OAuth/PII decisions.

### 4.3 Client Portal (Module 14) ✅ *(done 2026-07-23)*
- [x] **NOT ported 1:1** (scope correction, see below) — legacy's external `?portal=true` portal
  was never actually functional in production: its own auth gate unconditionally required a
  session token the frontend never sent (every `portal_*` call 401s, full stop), and even past
  that, handlers resolved "which client" from a client-supplied `email` in the request body — a
  textbook IDOR letting anyone read any other client's full PII by swapping the email. `portal_data`
  also sent full candidate rows (email/phone/licenseNumber/resume URLs) minus a 3-column denylist,
  regardless of what the UI rendered.
- [x] **New auth mechanism: per-contact magic link**, since neither `DECISIONS.md` nor
  `STACK-ARCHITECTURE.md` define one (`DECISIONS.md`'s only word was "gets extra security/QA
  budget"). An Owner/Admin generates a link for a specific `ClientContact` (new
  `ClientContact.portalEnabled` flag + `ClientPortalToken` model, only the SHA-256 hash ever
  stored); visiting it sets a short-lived signed HttpOnly cookie; every `/portal/*`/
  `/api/portal/*` request resolves identity from that cookie server-side ONLY — never from
  anything the client sends. Closes the legacy IDOR by construction. Generating a new link
  auto-revokes the prior one (one live link per contact); revocation is checked on every request
  (DB-backed), not just cookie expiry — verified live.
- [x] Read-only portal data: `/portal` (RSC) shows the curated visible-pipeline-stage set (kept
  from legacy — hiding New/Not-Qualified/No-Response/Client-Rejected/Future-Pipeline from an
  external client is sound UX, not a bug) via an **allow-list DTO** (`PortalCandidateDTO`/
  `PortalRoleDTO` name every exposed field explicitly — no email/phone/licenseNumber/npi/notes/
  documents/internal recruiter attribution) instead of legacy's send-everything-minus-a-denylist
  approach. Verified live: the rendered page contains zero PII beyond what's allow-listed.
- [x] `POST /api/portal/roles` — a client posts an open role; `clientId`/`postedByContactId`
  are always server-set from the resolved cookie identity, never the request body. New
  `OpenRole.postedByContactId` FK (distinct from the existing free-string `createdById`, which
  is for staff `User` actors) attributes portal-submitted roles without corrupting that column's
  meaning. Verified live end-to-end, including the DB-level attribution.
- [x] Portal-side request-access (`/portal/request-access`, new `PortalAccessRequest` model —
  deliberately NOT the same table as staff `AccessRequest`, since approving one grants a
  `ClientContact` a portal token, never one of the 6 internal RBAC roles) + an admin Approve
  flow (`/admin` → Portal Requests tab) that links to/creates a `ClientContact` and generates a
  link in one step — fixing legacy's confirmed no-op (`portal_request_access`'s target sheet was
  never reviewable from anywhere in the Admin Panel).
- [x] Admin management UI: `/crm/:id` → new **Portal** tab (Owner/Admin only, gated by the
  previously-unwired `configureClientPortal` capability) — generate/revoke a link per contact,
  shown once in a dismissible banner (same pattern as Wave 5.3's generated-password banner).
- **Done-when:** shareable read-only client view works ✅ — verified live against the real dev DB:
  generated a link, exchanged it, confirmed cookie-scoped identity and zero PII leakage; posted a
  role and confirmed DB-level attribution; revoked a link and confirmed immediate lockout;
  submitted + approved + declined portal-access requests, confirming status flips (fixing the
  legacy no-op) and that re-approval correctly 409s. 972 tests passing (up from 934);
  `tsc`/`eslint`/`prettier`/`next build` all clean.

---

# WAVE 5 — Intelligence & Admin (Month 3)

### 5.1 Briefs ✅ *(done 2026-07-23 — Daily Brief + Weekly Brief, `docs/MODULE-BREAKDOWN.md` §12/§13
  — this plan's own "Modules 15, 16" label pointed at the wrong module numbers, MODULE-BREAKDOWN's
  own 15/16 are Screening Scorecards/CRM; corrected here)*
- [x] Added `DailyBrief`/`WeeklyBrief` models (one row per period, `date`/`weekStart` unique) →
      migrated. Reused 3.1's `dailyRepository`/`liveActuals` — extended it (per this doc's own
      3.1 note) with 3 new batched `groupBy` range-aggregation methods (sourced/outreach/response
      counts per associate over an arbitrary window) instead of looping per-user; "hires"/"promoted"
      sourced from the existing canonical `stage_history`/audit trail (ONE definition — legacy had
      2-3 divergent ones for "promoted"/"stuck", consolidated here to what `stage-timing.ts`'s
      `isStuck`/the Pipeline `stuck` chip already established).
- [x] `server/ai/briefs/{daily-brief,weekly-brief,weekly-patterns,targets-suggest}.ts` — one
      `generateStructured()` call each (provider-agnostic, same layer as `extract-inbound.ts`),
      replacing legacy's raw hardcoded-Gemini-REST calls with no schema enforcement (legacy: a
      malformed model response silently became `{}`, no user-facing error). Voice/style prompt
      (Biruh's) ported verbatim, defined once (`lib/constants/briefs.ts`), not copy-pasted 3×.
      `generate`/`save`/`patterns` routes under `/api/briefs/{daily,weekly}/*` + `/api/targets/suggest`
      (the previously-3.1-deferred `ats_targets_suggest`, now unblocked — small addition to the
      existing manager target-setting panel's AI Suggest button).
- [x] Daily Brief + Weekly Brief ported with deliberate fixes, not 1:1: persists the AI's
      STRUCTURED output (not legacy's flattened plain-text blob) — legacy's archive only ever
      restored manual input fields, never the actual saved brief; here, re-visiting a past date
      shows the real saved content. Weekly Brief's legacy "Anomalies/Funnel/Trends" rolling-window
      block (~36 unmemoized client-side scans/render, the heaviest render path in the whole legacy
      app) is intentionally **deferred to 5.2** (Reports + Analytics already owns real
      time-analysis reporting — building it twice, once rushed here, would be wasted work).
- **Done-when:** ✅ briefs generate off live context (verified live against the dev DB — save/get
  round-trip, archive re-fetch, targets-suggest's 403 leadership gate, all confirmed working);
  numbers reuse the same `dailyRepository`/`stage_history` sources as the Overview/Daily Log from
  3.1, never a parallel recomputation. **Note:** live AI generation itself could not be exercised
  in this session's dev environment — `aiEnabled` resolved false locally for EVERY AI feature
  (including the pre-existing `inbound/triage`, confirmed not a regression), which traced to the
  local `.env`'s `ANTHROPIC_API_KEY` not actually loading (a `dotenv`-vault-style loader intercepts
  it — needs a `DOTENV_PRIVATE_KEY`/equivalent that isn't set locally). Not a code defect; flagged
  for Biruh to confirm the real deployed environment resolves the key normally.

### 5.2 Reports + Analytics ✅ *(done 2026-07-24 — `docs/MODULE-BREAKDOWN.md` §18 (Reports) + §25
  (Standalone Analytics/`kpi`) — this plan's own "Modules 18, 19" label didn't match
  MODULE-BREAKDOWN's own numbering (same issue found in 5.1), corrected here; "+ Perf" in the
  original title referred to legacy's separate `vw="perf"` leaderboard, which the task bullets
  never actually described — confirmed out of scope with Biruh, see below)*
- [x] Report services (server-computed, `server/services/reports/`): executive, per-client funnel
      (real WoW via a new `stageHistoryRepository.maxStageOrderAsOf` primitive — legacy's version
      was a lagged 7d-ago-vs-14d-ago delta shown next to a third, current-day count), mass journey
      (Gantt, computed server-side and capped at 50 visible rows — median/p90/bottleneck stats
      still run over the full filtered cohort, never silently), pipeline funnel, team performance,
      source ROI, client portfolio, time analysis, compliance.
- [x] **Fixed, not ported**: legacy's `STATUSES.indexOf(status) >= idx` "reached-or-beyond" bug —
      terminal/rejection status codes sort ABOVE most active stages (order 9-12 vs. Started's 8),
      so a rejected candidate was silently counted as having "reached" every earlier stage
      including Placed, in Pipeline Funnel/Source ROI/Team Performance. `maxStageOrderAsOf` fixes
      this by computing "highest ACTIVE stage ever reached" from real `stage_history`, excluding
      terminal transitions entirely (`lib/reports/stage-progress.ts`'s `activeOrderAsOf`, unit-
      tested for exactly this scenario). Also fixed: every time metric now uses `stageEnteredAt`/
      `placedAt` (already-correct schema columns), never legacy's generic `UpdatedAt`; Time-to-Fill
      and Source-of-Hire are each computed ONCE (`lib/reports/metrics.ts`), not duplicated with
      disagreeing definitions across Reports and the KPI view like legacy.
- [x] **Analytics** (`/analytics`, `viewAnalytics`-gated) — By-Status/Client/Source breakdowns,
      Time-to-Fill, Source-of-Hire, and **Client Capacity**. Client Capacity numerator is
      **all-time cumulative placements** at that client vs. the real `Client.capacity` column
      (confirmed with Biruh — legacy's period-filtered numerator barely ever fired outside "All
      Time"); no hardcoded per-client capacity map like legacy's three separate ones.
      *(Update 2026-08-03: actually folded into Reports now, per MODULE-BREAKDOWN §25's original
      intent — By-Status/Client/Source, Time-to-Fill, and Source-of-Hire all duplicated existing
      Reports tabs; Client Capacity is now a Reports tab, `GET /api/reports/client-capacity`, and
      the standalone `/analytics` page/route/service are deleted. `viewAnalytics` stays live —
      still gates Template Performance — just lost its own nav item.)*
- [x] CSV export (`GET /api/reports/export`) — a genuinely new route; legacy's export was 100%
      client-side (blob-URL trick, no backend call at all).
- [x] **Trends** ✅ *(done 2026-07-24, the "heaviest reports" flex item from D5/5.4 — legacy's
      rolling W/M/Q Anomalies/Funnel/Trends block, Weekly Brief's "DROP 50",
      `legacy/index.html:6379-6557`)*: unfiltered/team-wide (matches legacy's own scope, distinct
      from the 9 filtered reports above). 6 metrics × 3 rolling horizons (7d/30d/90d) + prior
      period, reusing the ALREADY-FIXED Wave 5.1 primitives instead of legacy's per-metric bugs —
      "Promoted" used candidate-`Tags` text-matching in legacy (one of two divergent app-wide
      definitions, now the one canonical audit-trail count); "Submitted"/"Hires" used
      `Status===X && UpdatedAt in range` (a generic last-write timestamp any unrelated edit
      resets), now real `stage_history` FLOW counts (entered-that-status-in-window, not a
      status-now snapshot). Anomaly thresholds ported verbatim (noise floor <5 on both sides,
      "new" at lastWeek=0 && thisWeek>=10, else flag at ≥30% WoW) — unit-tested for all 4 branches.
      Funnel conversion-%-of-preceding-stage math also unit-tested. Goal column: Sourced/Outreach
      = sum of the current rolling week's `DailyTarget`s (one new `targetsForDateRange` query);
      Hires = a hardcoded `DEFAULT_WEEKLY_PLACEMENT_GOAL=4` (legacy's own default — no app-wide
      settings mechanism exists yet to make this configurable, flagged as a known gap not a bug).
- [x] `/reports` (10 tabs) + `/analytics` (single page), both leadership-gated server-side
      (`viewReports`/`viewAnalytics`) — legacy had a real gate mismatch (nav showed Reports to all
      leadership, but the view body only rendered for the literal `admin` role) and ZERO server
      gating on `kpi`/`activity`/`perf` (UI-hidden only, trivially bypassed); every route here is
      `requireCapability`-gated regardless of what the client sends.
- [x] `vw="perf"` (KPI-targets-vs-actuals leaderboard) confirmed **out of scope** for this wave —
      its underlying data (targets/actuals) already shipped in 3.1/5.1; the leaderboard UI itself
      is a small, separate follow-up if wanted.
- **Done-when:** ✅ all reports + analytics compute (verified live against the dev DB, including a
  real Client Capacity alert round-trip — set a client's capacity to 1, confirmed the `red`/
  `approachingCapacity` alert fired, reverted); Mass Journey renders; Client Capacity alerts;
  CSV exports (verified headers + RFC4180 escaping on real data with a comma in a candidate name).

### 5.3 Admin (Module 21) — brings admin tables ✅
- [x] **No `invites` model** (scope decision, see below) — `access_request` already existed
  (Wave 0.3); Better Auth's own `User`/`Session`/`Account` tables already had the admin-plugin
  fields (`banned`/`banReason`/`banExpires`) pre-migrated. No schema migration needed this wave.
- [x] Configured Better Auth's **admin plugin** (`server/auth/auth.ts`) with `adminRoles: ["Owner",
  "Admin"]` and a `roles` map assigning the plugin's own `adminAc`/`userAc` definitions onto this
  app's real 6 role names — a SEPARATE authZ check from `hasCapability`; every route still gates
  with `requireCapability` first.
- [x] Routes (all in `/api/admin/*`, each double-gated: `requireCapability` + the plugin's own
  inner check): users list/create/set-role/ban/unban/reset-password/remove; access-requests
  list/approve(role picker → creates account → flips status)/decline.
- [x] `/admin` page — **Users, Access Requests, Roles (read-only), Blocked** tabs.
- **Scope decisions** (legacy's `AdminView` has 7 tabs; this wave ports 4):
  - **Team/Profiles tab NOT ported** — it's a self-service bio/avatar/phone directory, not an
    access-control feature; its real counterpart is the separate "My Profile" bullet below (5.4).
  - **Audit tab NOT ported** — links out to the already-existing `/activity` page instead of
    duplicating it (same call as Credentials Intelligence/CRM).
  - **Shifts tab NOT ported** — not in this bullet's original tab list at all; an 8th tab legacy
    has that was never in scope here.
  - **"Create Role" NOT ported** — legacy's is vestigial (creates a label with zero attached
    capabilities); matches CLAUDE.md's "custom roles deferred to v2."
- **Legacy bugs fixed, not ported**: `approve_request` had no backend handler at all in legacy —
  `AccessRequest.status` never flipped from "Pending" and approved requests reappeared forever;
  fixed here (approve now creates the account THEN flips status). Legacy's "Blocked" was a fake
  client-side-only gate (name-string array compared against email, could never match) — this
  wave's ban is enforced at the DB/session-creation-hook layer, confirmed live (a banned user is
  rejected at sign-in with `BANNED_USER`, not just hidden in the UI). Legacy's reset-password
  bypassed admin verification via a client-supplied `admin:true` boolean — this wave's reset goes
  through `auth.api.setUserPassword`, gated by `requireCapability("manageUsers")` server-side only.
- **Security note**: this wave's research also surfaced 4 new CRITICAL/HIGH findings in the
  *live legacy app itself* (hardcoded admin backdoor, unauthenticated plaintext-password leak,
  a role self-escalation path, a disconnected RBAC assign-role button) — documented as F8-F11 in
  `docs/SECURITY-AUDIT-LEGACY.md`, escalated to the owner, and explicitly NOT touched here (no
  write access to the live legacy Apps Script; the owner applies fixes there).
- **Done-when:** admin manages users + roles; RBAC changes take effect server-side. Verified live
  against the real Supabase DB: created a user with an auto-generated password → the SAME
  password signed them in; set their role; banned them → sign-in correctly rejected
  (`BANNED_USER`, DB-enforced, not a client check) → unbanned; reset their password → the new
  password worked; submitted a real access request → approved with a role → a working account
  existed and `status` flipped to `"approved"` (not stuck `"pending"`) → re-approving the same
  request correctly 409s; declined a second request; confirmed a non-`manageUsers` role (Manager)
  gets both the page's no-access screen and a 403 on the routes directly. All test accounts/
  requests removed afterward. 934/934 tests passing (up from 886); `tsc`/`eslint`/`prettier`/
  `next build` all clean.

### 5.4 Flex / risk-buffer — first to slip (D5)
> **The deferrable/flex items are CRM analytics (4.2 heavy analytics) + the heaviest reports (5.2)
> + these low-priority ports** — **never** the daily loop, pipeline, or funnel. (Daily Log & Overview
> moved to 3.1 and are *not* deferrable.) *(2026-07-24: "the heaviest reports" — the rolling
> Anomalies/Funnel/Trends block — shipped as part of 5.2's Trends report. Revenue/Health-Score/
> Compare and AI Client Workspace also shipped (2026-07-24) — confirmed via research neither
> hard-depends on Gmail. My Profile + Learn tutorial (below) also shipped (2026-07-24). The
> remaining flex work is now ONLY 4.2's Gmail-dependent chain: Gmail sync → shared sentiment
> scorer → churn-risk/contact-strength+whitespace/deal-probability — blocked on Biruh's
> account/OAuth/PII decisions.)*
- [x] **My Profile** ✅ *(done 2026-07-24, legacy `ProfileView` `index.html:8934-9005`)* —
      `/profile`: avatar (client-side canvas-resize to 160×160 JPEG data URI, uploaded via Better
      Auth's own `updateUser({image})` — reuses the existing `User.image` core column instead of
      adding a redundant one), name/email/role (read-only, from session), Bio/Phone/Location form
      (`User.bio/phone/location`, new columns, `PATCH /api/me/preferences`), the existing
      `SignatureEditor` embedded as-is (made reusable via an optional `onCancel` prop), and Change
      Password wired straight to Better Auth's native `changePassword` endpoint (server-hashed) —
      legacy posted to its own `change_password` event with a plaintext current-password
      comparison against the custom auth sheet (one of the flagged legacy security findings); no
      custom backend logic needed or wanted here.
- [x] **Learn tutorial** ✅ *(done 2026-07-24, legacy `index.html:5201-5275`)* — `/learn`: 8
      chapters ported verbatim (title/blurb/steps/"Try it" deep links onto real app routes),
      progress bar, mark complete/not-complete. **Fixed, not ported**: legacy tracked progress in
      unscoped `localStorage` (`desta_learn_progress`) — per-device, never synced, the same class
      of bug Wave 4.1 already fixed once for signature/sticky-note. Now real server-backed
      per-user state (`User.learnProgress Json`, `GET`/`PATCH /api/me/learn-progress`). Legacy's
      tutorial GIF media was never actually produced (confirmed in the source — it shows a "record
      a Loom and drop it here" placeholder when the file 404s); ported as the same placeholder,
      not invented.
- **Done-when:** each works. ✅ Verified live against the real dev DB: set bio/phone/location →
  persisted/redisplayed; uploaded an avatar via `updateUser` → persisted on `User.image`; changed
  password via the new form → old password correctly rejected, new password signed in → reverted
  to the dev seed password (`DestaDev123!` for `leliso@desta.works`); marked 2 Learn chapters
  complete then unmarked one → per-user progress persisted correctly across requests. All test
  data (avatar/bio/phone/location/learn-progress/password) cleaned up afterward. 1106/1106 tests
  passing (up from 1085); `tsc`/`eslint`/`prettier`/`next build` all clean.

---

# WAVE 6 — Cutover & Decommission (Month 3)

- [ ] Full QA pass + fix integration bugs 🟡 *(first pass done 2026-08-10)* — a 3-way code-level
      audit (core recruiting loop; CRM/Reports/Admin/Portal; Templates/Resume/Briefs/Migration
      wizard) found and fixed 6 real bugs: Sourcing's outreach/promote/snooze modals discarded a
      recruiter's typed note/date on any failure (`close()` fired in the failure branch too, not
      just success); a lost promote/respond/log race (409 CONFLICT — someone else acted on the
      lead first) was treated as a delete, silently corrupting the pager's total count (now
      re-syncs from the server instead); CRM's Portal tab got stuck on "Loading…" forever on a
      fetch failure with no retry; its "Regenerate" link action had no confirmation despite being
      exactly as destructive as "Revoke" (which does confirm — revoking a contact's live link);
      the new resume Download button opened its tab via `window.open` *after* an `await`, which
      Safari/Chrome silently popup-block since the async gap breaks the "direct result of a click"
      requirement (now opens the tab synchronously, navigates it once the signed URL resolves);
      and that same button was shown to viewers without `viewCredentials` even though the download
      endpoint is gated on it, guaranteeing a 403 (now hidden for them, matching the DTO gate).
      The migration wizard itself — the tool the real Sheet cutover will run through — was
      independently re-verified against its actual code (not just its UI copy) and confirmed
      correctly idempotent, stage-preserving on re-import, and per-row transactional.
      **Second pass (same day)** covered the areas the first pass left unreviewed — Add-Candidate
      form, Journey tab, Inbound Triage, Daily Log/Briefs, Credentials Intelligence, CRM's
      remaining tabs (Contacts/Tasks/Meetings/Timeline), Client Compare — and found + fixed 6 more:
      **Inbound Triage's "Attach to this lead" trusted a stale, once-computed dedupe match with no
      server-side re-verification** — a reviewer editing the extracted name/email after the match
      ran could attach the reply to the WRONG lead with no guard catching it (the same
      wrong-person-merge risk the résumé-match flow was deliberately built to prevent); fixed by
      having `attach()` re-run the dedupe match against the submitted (possibly-edited) identity
      server-side and refuse (409) unless it independently resolves to the same lead. The Journey
      modal had the identical "stuck on Loading… forever on fetch failure" defect already fixed
      once this session in CRM's Portal tab, just not yet here — same fix applied. CRM Contacts'
      "Mark departed" had no loading/disabled state, risking a double-submit race, unlike every
      sibling action in the same file. Daily Log's self-report submit never re-synced the view on
      a FAILED submit, so a 409 from a raced double-submit (already logged) left the UI stuck
      showing "haven't logged today" even though it had been — now always refreshes. That same
      race had a second, deeper bug: the pre-check-then-insert isn't atomic, so a TRUE concurrent
      double-submit could still slip past the pre-check and hit the DB's real `@@unique([userId,
      date])` constraint, which surfaced as a raw 500 instead of the same clean 409 the normal path
      gives — now caught and mapped. Lastly, the shared `Modal` primitive's ESC/backdrop/× always
      dismissed regardless of an in-flight submit — closing the Add Candidate dialog mid-request
      didn't cancel the request, so the candidate still got created and the modal still navigated a
      moment later, after the user believed they'd cancelled; `Modal` gained an opt-in
      `dismissBlocked` prop (fully backward-compatible, every other modal unaffected) and it's wired
      into Add Candidate. Verified clean this pass: the legacy "Tasks mark-done duplicates a row"
      bug is genuinely fixed (confirmed against the actual repository code, not just the doc
      comment); Client Compare (pure read-only, no mutation surface); Credentials Intelligence
      (same, print button aside); Weekly/Team Brief generation; all `lib/daily.ts` week/date
      boundary math (Monday-anchor, tenure-ramp, pacing) re-derived by hand at the boundaries and
      found correct. Coverage is now broad but still not exhaustive — no browser-automation tool
      exists in this environment, so this remains a code-level audit, not a click-through; a manual
      pass before go-live is still recommended.
- [x] Move resume files AND profile avatars to object storage ✅ *(done 2026-08-10, D8)* — no
      file/image bytes stay in the DB. Built on the **S3 protocol** (`@aws-sdk/client-s3`,
      `server/integrations/storage.ts`), not a vendor SDK, so swapping providers later (Supabase
      Storage's own S3-compatible endpoint today → real AWS S3 / Cloudflare R2 / Backblaze B2 /
      self-hosted MinIO) is a credentials change only. Avatars: `POST /api/me/avatar` uploads to a
      public bucket, `User.image` now holds a stable URL instead of a base64 blob — also wired into
      the nav header and Admin's role-member avatar stack, which previously always showed initials.
      Resumes: `POST /api/resume/upload-url` gives the browser a signed URL to PUT the original
      file straight to a private bucket (never through our own server — avoids Vercel's body-size
      limit), persisting `Document.storageKey`; downloads go through `GET /api/documents/:id/
      download-url` (gated `viewCredentials`, same tier as the extracted text), which mints a
      fresh 5-minute signed URL per click rather than persisting one that would go stale. **Ships
      dormant** — mirrors `aiEnabled`/`apolloEnabled`'s "activate-by-key" convention
      (`storageEnabled`): no environment has `S3_*` credentials yet, so every path above still
      returns a clear "not configured" error until Biruh sets them and runs `pnpm setup:storage`
      once (creates the `avatars`/`resumes` buckets).
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
