# New App Security Audit (Wave 0.9 companion — `src/` scope)

**Date:** 2026-07-17 · **Auditor:** Claude (AI-assisted, 5 parallel research passes) · **Source:**
the live Next.js/Prisma/Better-Auth app (`src/`), current production Vercel deployment + env
config. Companion to `docs/SECURITY-AUDIT-LEGACY.md` (the Apps Script backend audit) — this
covers the **new** app only, per explicit scope decision.

> No destructive/live testing performed against production. Findings are from source review +
> read-only checks (`vercel env ls`, `vercel logs`, production `curl` smoke tests already run
> earlier this session) only.

## Bottom line

Unlike the legacy backend (effectively open, no real auth), **this app's authorization model is
disciplined** — every one of 60 API routes has a real server-side auth check, role is verifiably
server-controlled, error responses don't leak internals, and the audit log is append-only and
consistently written. The real exposure here is narrower but still serious: **one bug lets an
unvetted outsider create a live account**, and **that account can then read the entire PHI
database by design** — the combination is the single most urgent thing to fix. Beyond that,
several "encrypt-at-rest" and "password reset" capabilities the docs claim exist either don't, or
only partially do.

---

## Severity: CRITICAL

### C1 — Google OAuth sign-in bypasses "no self-registration," creating live PHI-reading accounts for anyone with a Google account
**Compounded by:** any authenticated account (regardless of role) can read any candidate/lead/role/document by ID (see H8) — so this isn't just an unwanted signup, it's an open door to the full PHI database.

- `src/server/auth/auth.ts:29-38` configures the Google provider with no `disableSignUp`/`disableImplicitSignUp`. `emailAndPassword.disableSignUp: true` (`auth.ts:27`) only gates `/sign-up/email` — Better Auth's social-sign-in path is gated by a *separate* provider-scoped flag that's never set here.
- Result: a never-before-seen Google account hitting "Continue with Google" on `/sign-in` gets a brand-new `User` row auto-created with `role: "Associate"`, fully authenticated, session issued — no invite, no access-request review, no admin approval.
- `Associate` has zero entries in `ROLE_CAPABILITIES` (`src/lib/constants/roles.ts:64`), but that's still enough to pass every `requireUser()`-only route — including `GET /api/candidates/list` (full roster: name, email, phone, clinical profile, employer) and, per H8 below, any individual candidate/lead/role/document by ID.
- **Concrete attack:** anyone with a Google account visits the public sign-in page and self-provisions a working account with read access to the whole PHI dataset. No credentials to steal, no phishing needed — just click the button.

**Fix:** set `disableSignUp: true` (or the equivalent `disableImplicitSignUp`) on the Google provider config in `auth.ts`, so OAuth sign-in only succeeds for **already-existing** users (invited via the seed/admin flow), matching the stated "invite-only" policy for both auth methods.

---

## Severity: HIGH

### H1 — ✅ FIXED (2026-07-18) — The audit log permanently stores plaintext PII/PHI, bypassing encryption entirely — irreversible even after the encryption key is turned on
- `writeAudit` (`src/server/db/audit.ts:30-41`) writes `before`/`after` straight to `activity_log` with **no encryption call anywhere** in the path.
- Concrete trigger: any leadership-role edit to `licenseNumber` via `PATCH /api/candidates/:id` flows through `pickAudited` (`candidate.service.ts:392-398`), which echoes the *already-decrypted plaintext* value into `activity_log.before`/`after` as plain JSON.
- This directly contradicts `docs/DATA-MODEL.md:129-133` / `docs/DECISIONS.md:93-95`, which both claim `activity_log` is protected by "access control **+ encryption at rest**." The access-control half is real (`viewAudit`, Owner/Admin only); the encryption half doesn't exist in code.
- Turning on `FIELD_ENCRYPTION_KEY` tomorrow does **not** fix this retroactively or going forward — every future `licenseNumber` edit will keep writing plaintext into the audit trail forever, by design of the current code path.
- **Fix applied:** `writeAudit` (`src/server/db/audit.ts`) now redacts a fixed set of sensitive keys (`licenseNumber`, `email`, `phone`, `npi`, `extractedText`, `extractedData`) to `"[REDACTED]"` anywhere they appear in `before`/`after`, at the single write choke point — covers every current and future caller, not just `candidate.service.ts`'s `update`. Historical rows already written stay plaintext (no backfill/redaction-in-place was run against existing `activity_log` data — flagging this the same way H2/M8 flag the lack of a backfill story for field-crypto).

### H2 — The encryption subsystem covers only 2 of ~9+ sensitive columns; email/phone/NPI/notes were never in scope, contradicting the docs
- Only `Candidate.licenseNumber` and `Document.extractedText`/`extractedData` are ever passed through `encryptField`. `Candidate.email`, `phone`, `name`, `CandidateNote.body` (freeform — could contain PHI-adjacent commentary), and the entire `SourceLead` table (`npi`, `email`, `phone`, `notes`) have **no encryption code path at all** — not "key is off," but literally never wired.
- `README.md:206` and `docs/DECISIONS.md:96-98` state PII columns including **NPI and contact fields** are "encrypted at rest" — this is not true in the current implementation; only license number and résumé-extraction output are covered.
- **Separately confirmed:** `FIELD_ENCRYPTION_KEY` is not currently set in the production Vercel environment at all, so even the two fields that ARE wired are being stored as plaintext right now.
- **No backfill/rotation story exists** — the design is "encrypt on next write" (`field-crypto.ts:14-15`); if the key is added today, every already-plaintext row (likely most of the historical dataset) stays plaintext indefinitely unless a candidate/document record happens to be edited again. No backfill script exists under `scripts/`.

### H3 — No password-reset flow exists at all; the only recovery path is a manual production database edit
- No `forgetPassword`/`resetPassword` route, action, or Better Auth plugin config exists anywhere in `src/`. No admin panel (deferred to Wave 5) means no admin-driven reset either.
- `scripts/seed-owner.ts` is a first-run bootstrap only (skips if the email already exists) — it cannot reset an existing account's password.
- **Today, if any non-owner staff member forgets their password, the only fix is an engineer manually rewriting their `Account.password` hash directly against the production database.** That's both an availability risk (locked-out staff) and a security-process risk if that manual workflow isn't tightly controlled.

### H4 — ✅ PARTIALLY FIXED (2026-07-18) — `scripts/reset-owner-password.ts` defaults to what looks like the real production owner's email and a hardcoded, guessable password — with zero environment guard
- `scripts/reset-owner-password.ts:10-11`: `process.argv[2] ?? "leliso@desta.works"`, `process.argv[3] ?? "DestaDev123!"` — `desta.works` is the real org domain (used throughout the test suite as the real fixture domain), unlike `seed-owner.ts`'s obviously-fake `owner@desta.local` default.
- No `NODE_ENV`/environment check anywhere in the script. It connects via whatever `DATABASE_URL` is currently active — which, since the team now pulls real production env vars locally for testing, could be the production database.
- **Concrete risk:** running this script without explicit arguments (a copy-paste mistake, a missing CLI arg) silently overwrites the real owner account's password in production to a fixed, now-committed-to-git-history string. This is a de-facto backdoor for anyone who reads this file.
- **Fix applied:** `<email>`/`<password>` are now required CLI args (no more silent fallback to `leliso@desta.works`/`DestaDev123!`), and the script refuses to run under `NODE_ENV=production` unless `FORCE_PROD_RESET=1` is explicitly set. **Still open:** the real owner's password itself hasn't been rotated — that string is permanently in git history regardless of the code fix, and only the owner can actually change the live credential. Remediation item 2 (rotate the credential) is still pending owner action.

### H5 — ✅ FIXED (2026-07-18) — Two AI-calling, any-authenticated-user endpoints have zero rate limiting
- `POST /api/inbound/triage` and `POST /api/roles/parse-jd` both call an LLM per request, are gated only by `requireUser()` (any role, including a self-registered Associate per C1), and have **no `checkRateLimit` call anywhere** in their service paths — unlike `resume/extract`, `migration/commit`, and the Discover/Smarter-Sourcing services, which all do.
- Combined with C1, an unvetted self-registered account can freely hammer these to run up LLM provider spend or exhaust quota, with no local throttle at all.
- **Fix applied:** both routes now call `checkRateLimit` (20/60s per user, matching `resume/extract`) before parsing/dispatching. Still subject to H6's in-memory/per-instance limitation — a real fix for H6 (persistent store) strengthens this further.

### H6 — Rate limiting that DOES exist is in-memory and per-process — not real in a serverless deployment
- `src/server/http/rate-limit.ts:5-11,24-25` is a module-level `Map`, and its own doc comment already says as much: "PER-INSTANCE and BEST-EFFORT... does not coordinate across serverless instances / regions and resets on redeploy... production should back it with the DB/secondary storage." Nothing does.
- This weakens **every** rate limit in the app, including Better Auth's own sign-in brute-force protection (`auth.ts:44-57`, `/sign-in/email`: 5/60s) — on Vercel, an attacker distributed across concurrent instances (or simply surviving a cold start) effectively gets `limit × N-instances` attempts, not `limit`.
- This is the single root cause behind H5's severity and a contributing factor to brute-force risk on sign-in.

### H7 — ✅ FIXED (2026-07-18) — `DELETE /api/roles/:id` is an irreversible hard delete with no capability gate, unlike the equivalent candidate operation
- `src/app/api/roles/[id]/route.ts:26-30` — the route's own comment says "HARD delete... no undo," yet it only requires `requireUser()`. Compare `POST /api/candidates/:id/purge` (`src/app/api/candidates/[id]/purge/route.ts:14`), an equally irreversible operation, correctly gated behind `requireCapability("purgeCandidate")` (Owner/Admin only).
- **Any Associate or Screener (zero capabilities) can permanently delete any Open Role record with no undo and no elevated permission check.**
- **Fix applied:** added a new `deleteOpenRole` capability (Owner/Admin only, mirroring `purgeCandidate`'s scope — distinct from the existing `manageRoles`, which governs user-*account* roles, not Open Role job requisitions) and gated the route behind `requireCapability("deleteOpenRole")`. No client UI currently calls this endpoint, so no button-visibility change was needed.

### H8 — IDOR by design: any authenticated user (any role) can read any candidate/lead/role/document by ID
- `candidateRepository.findById`, `documentRepository.findById`, and the lead/role detail lookups only check existence + soft-delete status — never an ownership/relationship predicate.
- This is **documented as an intentional decision** in `docs/DECISIONS.md` (D3: "every lead action is open to any signed-in operator," small-team model) — not a code bug. Flagging it here explicitly because its risk profile changes materially once C1 is considered: it's a reasonable trade-off for a small, fully-vetted internal team; it's a serious problem the moment ANY Google account can join that team for free (C1). **Fixing C1 substantially de-risks H8 without needing to change H8's design.**

---

## Severity: MEDIUM

### M1 — No password complexity policy anywhere reachable in practice
Better Auth's own 8-char minimum only applies to the `/sign-up/email` route, which is disabled. The only working account-creation path (`scripts/seed-owner.ts`) performs zero validation on the password it's given — whatever an operator types for a new hire is accepted, weak or not.

### M2 — ✅ FIXED (2026-07-18) — No security headers configured anywhere
No `headers()` in `next.config.ts`, no `middleware.ts`, no `vercel.json`. Missing: CSP, `X-Frame-Options` (sign-in page is iframe-able — clickjacking risk), `X-Content-Type-Options`, `Permissions-Policy`, explicit `Referrer-Policy`. This isn't a documented tradeoff — no mention in CLAUDE.md/DECISIONS.md — it looks like an oversight. (HSTS is present via Vercel's platform default, so that one's covered.)
- **Fix applied:** `next.config.ts` now sets `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, a restrictive `Permissions-Policy`, and a same-origin `Content-Security-Policy` (`default-src 'self'`, `frame-ancestors 'none'`, etc.) on every route. CSP intentionally keeps `script-src`/`style-src 'unsafe-inline'` (no nonce infrastructure exists yet) — the app has zero `dangerouslySetInnerHTML`/external scripts, so the value here is blocking all non-self origins, not hardening an XSS vector that doesn't exist. Verified via `next build` (succeeds) + a local dev-server `curl` showing all headers present on `/sign-in`; **not verified in a real browser this session** — recommend a quick visual smoke pass on the next preview deploy before this reaches production, in case any current UI relies on something the CSP unexpectedly blocks.

### M3 — AI prompt-injection surface in résumé/JD/inbound extraction (narrow, contained)
`src/server/ai/parse-resume.ts:86` and siblings concatenate raw user-supplied text directly into the model prompt with only a plain-text header as a "boundary" (not a real one). A malicious résumé could inject instructions that influence AI-generated free-text fields (`snapshot`, `bullets`). **Contained**: the structured-output schema has no boolean/score field an injection could flip, and a human always reviews before `/api/resume/save` persists anything — so the blast radius is "misleading text a recruiter might read," not an autonomous wrong decision.

### M4 — `POST /api/leads/import` is ungated where its sibling bulk-import routes require leadership
`/api/migration/prepare` and `/api/migration/commit` both require `requireCapability("bulkImport")`; `/api/leads/import` (same class of operation — bulk CSV import) only requires `requireUser()`. Worth confirming whether this is intentional (matches the "sourcing is open to any operator" design) or a gap.

### M5 — Some write-endpoint schemas skip `.strict()`, inconsistent with the rest of the codebase
`moveInputSchema`/`bulkMoveInputSchema` (`src/lib/validation/pipeline.ts:148-158`), `importInputSchema` (`migration.ts:25-37`), and both résumé schemas (`resume.ts:120-165`) don't reject unknown keys the way candidate/lead schemas do. Low risk (nothing downstream reads unnamed fields) but worth normalizing for defense-in-depth consistency.

### M6 — `email`/`phone` carry no protection story at any layer — likely intentional, but undocumented as such
`toCandidateDTO` gates only `licenseNumber`; email/phone/name flow to every signed-in user unconditionally, are never encrypted, and aren't called out anywhere as a deliberate scope decision (vs. `licenseNumber`, which clearly is one). Worth an explicit decision record either way.

### M7 — Create/update/verify/restore candidate responses over-fetch internal fields
`POST/PATCH /api/candidates/*` return the full `CandidateDTO` (every column minus `licenseNumber`, including internal-only fields like `legacyId`, `deletedById`, `filledFromRoleId`) rather than the tightly-whitelisted `CandidateProfileDTO` used elsewhere. Not new PII exposure, but an internal-data leak into the browser Network tab and inconsistent DTO discipline.

### M8 — No key-rotation or backfill mechanism for field-crypto
Single static key, no versioning beyond the fixed `enc:v1:` prefix, no re-encrypt script. If/when `FIELD_ENCRYPTION_KEY` is set, historical rows stay plaintext until individually re-saved — see H2.

---

## Severity: LOW / Informational

- **L1 — No global `middleware.ts`.** Every route is individually guarded (verified: 60/60 have a real check), but there's no fallback net — a future route added without remembering the guard call would be silently open. Structural risk, not a current finding.
- **L2 — Session cookie config is entirely implicit Better Auth defaults** (httpOnly/secure/sameSite/7-day expiry) — reasonable values, but undocumented in-repo; a future library upgrade changing defaults would silently change session behavior with nothing to catch it.
- **L3 — Next.js is one major version behind** (15.5.19; 16.x is current). Prisma (7.8.0) and Better Auth (1.6.23) look current.
- **L4 — Dead/unenforced capabilities** (`manageUsers`, `manageRoles`, `manageAccessRequests`, `configureClientPortal`, `viewAnalytics`, `viewCrm`) exist in the role model but are referenced by zero routes — expected, since the Admin module (Wave 5) hasn't shipped; just needs re-checking when it does.
- **L5 — Legacy-imported résumé links point to raw external Google Drive URLs** with no proxying/re-authorization by this app — access control for those documents lives entirely in whatever sharing settings exist on the external files, outside this app's control.
- **L6 — ✅ FIXED (2026-07-18) — `X-Powered-By: Next.js` header still sent** (default not disabled in `next.config.ts`) — trivial fingerprinting signal, essentially free to turn off. `poweredByHeader: false` added alongside the M2 headers work.

### What's already working well (confirmed, not just assumed)
- **Every one of 60 API routes has a real server-side auth check** — zero unauthenticated routes found.
- **`role` is verifiably server-controlled** — Better Auth's `input: false` blocks client writes, no route anywhere writes `user.role`, self-registration via email is disabled, and the access-request flow only creates a review record, never a live user.
- **Session validation hits the database every request** (no blind cookie trust, no `cookieCache` shortcut).
- **No SQL injection surface** — 100% Prisma parametrized queries, zero raw-SQL usage in `src/`.
- **Zero `dangerouslySetInnerHTML` usages** — the legacy stored-XSS defect was genuinely fixed, not just relocated.
- **Complete Zod validation coverage** on every route that accepts a body.
- **No client-exposed AI provider keys**, no SSRF surface.
- **Error responses never leak raw messages/stack traces** to the client — verified by both code review and an existing unit test (`api-handler.test.ts`).
- **No hardcoded secrets** found anywhere in `src/`; `.env.example` is clean; `.env` has never been committed.
- **No CORS misconfiguration** — same-origin default holds, nothing overrides it.
- **Audit log is append-only** (zero update/delete call sites against `activity_log`), consistently written across every mutation path checked, and survives candidate purge (no FK cascade risk) — its only gap is the plaintext-content issue (H1), not its integrity or coverage.
- **No user-enumeration or timing leak on sign-in** — Better Auth normalizes both the error message and response timing across "no such user" / "wrong password."

---

## Remediation (ordered by urgency and dependency)

1. **Fix C1 immediately** — set `disableSignUp`/`disableImplicitSignUp` on the Google provider in `auth.ts`. This is a one-line config change and closes the most exploitable gap; do this before anything else on this list.
2. **Rotate the `DestaDev123!` credential** (H4) — it's now effectively public (this doc + `reset-owner-password.ts`'s git history). Change the real owner's password, then add a `NODE_ENV`/environment guard to the script so it refuses to run against production without an explicit `--force`-style flag.
3. **Decide and act on `FIELD_ENCRYPTION_KEY`** (H2) — this is an owner decision (generate + set the production key), but land it together with:
4. **Fix the audit-log plaintext gap (H1)** — either encrypt `before`/`after` payloads before they hit `activity_log`, or explicitly redact known-sensitive fields (`licenseNumber` etc.) before audit-writing. Needs to happen at/before step 3, since turning on encryption doesn't retroactively fix this path.
5. **Stand up a real, persistent rate limiter (H6)** — Redis/Upstash or similar, replacing the in-memory `Map`. This unblocks fixing H5 (add limits to the two unthrottled AI routes) and hardens sign-in brute-force protection for real.
6. **Add a password-reset flow (H3)** — at minimum an admin-driven reset (even a CLI script with a proper environment guard, until Wave 5's admin panel ships); ideally Better Auth's built-in email-based reset.
7. **Gate `DELETE /api/roles/:id` behind a capability (H7)** — small, fast fix, matches the existing `purgeCandidate` pattern.
8. **Add security headers (M2)** — CSP, X-Frame-Options, X-Content-Type-Options, Permissions-Policy via `next.config.ts`'s `headers()`. Low effort, meaningful defense-in-depth, especially important since there's no CSP backstop for the XSS class of bug even though none is currently known.
9. **Clarify/document the `email`/`phone` protection scope (M6)** and the `leads/import` capability question (M4) — these may already be intentional; just need a decision recorded either way.
10. Everything else (M1, M3, M5, M7, M8, L1-L6) — lower urgency, batch into normal engineering work.

---

## Status
- [x] Audited — `src/` (new app) scope, 5-dimension parallel review, findings documented.
- [ ] Escalate to Biruh (owner) — C1 in particular is a live, exploitable gap on a production PHI system; needs an urgency/timeline decision, same as the legacy audit's open item.
- [x] Fix C1 (Google OAuth) — `socialProviders.google.disableSignUp: true` added in `src/server/auth/auth.ts` (2026-07-18); self-registration via Google now blocked, existing Google-linked accounts unaffected.
- [x] Fix H1 (audit-log plaintext PII) — `writeAudit` now redacts sensitive keys before every insert (2026-07-18). Historical rows already written are NOT retroactively redacted.
- [x] Fix H5 (unthrottled AI routes) — `checkRateLimit` added to `/api/inbound/triage` and `/api/roles/parse-jd` (2026-07-18).
- [x] Fix H7 (unguarded role hard-delete) — new `deleteOpenRole` capability (Owner/Admin), route now uses `requireCapability` (2026-07-18).
- [x] Partial fix H4 (backdoor default script credential) — script now requires explicit args + a `NODE_ENV=production` guard (2026-07-18). **Still needs owner action**: rotate the real owner password (it's in git history regardless of the code fix).
- [x] Fix M2/L6 (missing security headers / `X-Powered-By`) — baseline headers + CSP added in `next.config.ts` (2026-07-18). Verified via build + curl; not yet verified in a real browser.
- [ ] Owner decision needed: generate and set `FIELD_ENCRYPTION_KEY` for production (H2), and confirm whether a historical-data backfill is wanted or accepted as "protect going forward only."
- [ ] Owner decision needed: password-reset story (H3) — build a real flow now, or accept manual-DB-edit as the interim process with tighter controls?
- [ ] Owner decision/infra needed: persistent rate-limit store (H6, e.g. Upstash/Redis) — the in-memory limiter (including H5's new calls, and Better Auth's own sign-in throttle) doesn't coordinate across serverless instances.
- [ ] Still open, not yet started: H2 (encryption scope/key), H3 (password reset), H6 (persistent rate limiter), H8 (IDOR — accepted by design, re-risk-assess only), M1/M3/M4/M5/M6/M7/M8, L1-L5.

**Open question for the owner:** same question as the legacy audit — given this is a live PHI system, what's the acceptable window before C1 is patched? It's a small, well-understood fix; recommend treating it as "fix today," independent of the rest of this list's timeline. H2/H3/H6 in particular need an owner call before more code gets written against them (key generation, backfill scope, and a paid Redis/Upstash add-on are all decisions outside engineering's call to make unilaterally).
