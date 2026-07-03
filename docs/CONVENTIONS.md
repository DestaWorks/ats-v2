# Engineering Conventions — DestaHealth ATS

Standards for the **new** codebase. The legacy `index.html` is exempt (it is being
strangled, not maintained). These exist so the project is reviewable, testable, and safe to
ship continuously.

---

## 1. Source control & workflow

- **Trunk-based with short-lived branches.** Branch from `main`, open a PR, merge when green.
- **No whole-file uploads.** Every change is a reviewable diff. (The current
  "Add files via upload / Delete index.html" history stops now.)
- **Branch protection on `main`**: require PR + passing CI + at least one review.
- **Conventional Commits**: `feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `chore:`,
  `security:`. Subject ≤ 72 chars, imperative mood.
- **Small PRs.** One concern per PR. A ported view is fine; a 9,000-line dump is not.
- **No secrets in git.** `.env` is gitignored; commit `.env.example` with keys, not values.
- **Promotion path (DECISIONS D6):** branch → per-PR preview URL → merge to `staging`
  (QA on `staging.zyx.com`) → merge to `main` (production `zyx.com`). Staging and production run
  on **separate Supabase projects**; **migrations and the data migration run staging-first, then
  production.** Never author schema directly against prod.

## 2. Languages & tooling

- **TypeScript everywhere.** `strict: true`. No `any` without a written reason.
- **Formatting**: Prettier (single source of truth — no style debates in review).
- **Linting**: ESLint (typescript-eslint, react-hooks). CI fails on lint errors.
- **Package manager**: pick one (pnpm recommended) and commit the lockfile.
- **Node**: pin the version (`.nvmrc` / `engines`).

## 3. Project structure (target)

**The authoritative folder structure is `docs/STACK-ARCHITECTURE.md` §2** — the locked
`modules/` (UI feature slices) + `server/{services, repositories, rules, auth, db, ai, http}`
(layered backend) layout. Do not invent a parallel `features/` + `domain/` + `api/` tree; use
STACK-ARCHITECTURE §2 verbatim. This section only adds file-size/complexity conventions on top.

- **One component per file.** No 9,000-line files; flag any file > ~400 lines in review.
- **No giant components.** If a component has more than a handful of `useState`, extract
  hooks/subcomponents. (The legacy `App()` with ~180 hooks is the anti-pattern we're fixing.)

## 4. Naming

- **Files**: `kebab-case.ts` / `PascalCase.tsx` for components.
- **Components**: `PascalCase`. **Hooks**: `useCamelCase`. **Vars/functions**: `camelCase`.
- **Constants/enums**: `UPPER_SNAKE` for module constants; real `enum`/union types for domain
  values (status, role, track, license status) — not bare strings scattered around.
- **No cryptic abbreviations.** The legacy code uses names like `sV`, `sFC`, `vw`, `sAE` —
  do not carry these over. Names should be self-explanatory (`setView`, `currentView`).

## 5. State & data

- **Server state** via a data-fetching layer (e.g. TanStack Query) — not hand-rolled
  `fetch` + `useState` + manual refetch.
- **No business logic in components.** Scoring, disqualification, and stage-gate rules live
  in `server/rules` and are **server-authoritative**; the client may mirror them for UX only.
- **No `localStorage` for auth/role.** Session is provider-managed; role comes from the API.
- **Saved views / filters:** shareable filter and saved-view state lives in a `saved_views`
  table + URL `searchParams` (so a view can be linked and reloaded) — **not** `localStorage`.
  `localStorage` is only for non-sensitive UI prefs (e.g. collapsed-panel, theme).
- **Forms:** use **react-hook-form + `zodResolver`** (share the zod schema with the API
  boundary); no hand-rolled `useState`-per-field forms.
- **Dates**: store ISO 8601 UTC; format at the edge. Don't compute SLAs from local time.

## 6. API & validation

- **Validate every boundary** with zod; share schemas between client and server.
- **Resource-oriented endpoints**, not a single multiplexed `event` switch.
- **Authorize every endpoint** server-side by role. UI hiding is UX, never security.
- **Writes return results.** No fire-and-forget `mode:"no-cors"`.
- **Audit every state change** (actor, action, entity, before/after, timestamp).

## 7. Security rules (non-negotiable — NDA-binding)

- Never trust the client for authentication or authorization.
- Never log PII/PHI (names, emails, phones, license #, NPI, patient data).
- **Audit vs. logs are different systems.** The `activity_log` table (`before`/`after`)
  **intentionally** stores PII, under access control (capability-restricted reads) and
  encryption at rest — it is the compliance audit trail. **Application and observability logs
  (Sentry, structured stdout) must never contain PII/PHI.** Do not conflate the two: audit is
  a governed data store, logs are operational telemetry.
- **Enforce layer boundaries with off-the-shelf lint** (`eslint-plugin-boundaries` /
  `import/no-restricted-paths`) plus `import "server-only"` — not hand-written AST rules. This
  keeps Prisma out of components and services out of the client bundle.
- **No secrets in code, ever.** Env vars / Vercel & Supabase secret stores only; the **Owner
  holds the keys**, we build against them. Commit `.env.example`, never `.env`.
- Least-privilege access to sensitive columns by role; encrypt PHI/PII at rest.
- Parameterized queries only (Prisma) — no string-built SQL.
- Comply with **HIPAA (where applicable)** and the **Ethiopian Data Protection Proclamation
  1321/2024**; report any suspected incident/breach promptly (see `docs/PROJECT-CONTEXT.md`).

## 7a. Dependency & license policy (NDA-binding)

- **Permissive licenses only**: MIT, BSD, Apache-2.0 may be added in the ordinary course.
- **No copyleft/reciprocal licenses** (GPL, LGPL, AGPL) or anything that would force
  open-sourcing the product — **without the Owner's prior written consent.**
- Maintain an **SBOM** (third-party components + their licenses); update on dependency changes
  and add a CI license check that fails on a disallowed license.
- Prefer well-maintained, widely-used packages; justify each new dependency in the PR.

## 8. Testing

Rigor is **tiered — not full coverage everywhere** (we ship then harden):

**Mandatory (no merge without tests):**
- **Rules engine and transforms** — unit tests (scoring, disqualify, stage gates,
  status-code normalization, import mapping). This is the highest-value surface.
- **Authorization-failure cases** — every guarded route has a test proving the wrong role
  is rejected (not just that the right role passes).
- **Migration golden-files** — each ETL transform has a golden input → expected-rows test.

**Best-effort elsewhere ("ship then harden"):**
- Other API routes, components, and E2E flows (sign-in, add candidate, move stage, promote
  lead, parse resume) get tests as time allows and are backfilled when a slice stabilizes.
- A bug fix ships with a test that would have caught it (this applies everywhere).

CI runs typecheck + lint + the mandatory tests on every PR; red = no merge.

## 9. Documentation

- Update the relevant `docs/*` when behavior changes. Docs and code move together.
- Public functions/services get a short doc comment on intent (not restating the code).
- Decisions of consequence get a short ADR note (in EDD or a `docs/adr/` folder).

## 10. Accessibility & UX baseline (per-view acceptance)

Every ported view is only "done" when it meets these — they are **acceptance items**, not
nice-to-haves:

- **Loading / empty / error states** for every async view (use the shared `Skeleton` /
  `EmptyState` / `ErrorState` primitives).
- **Accessibility (a11y):** semantic HTML, labelled inputs, keyboard-navigable, sufficient
  contrast; a11y-hard primitives (Dialog, DropdownMenu, Combobox, Toast) use shadcn/Radix.
- **Responsive:** works on mobile/tablet widths, not desktop-only.
- **Print:** a usable print layout (`print:` variants) where the legacy view was printed
  (reports, credentials matrix, client-facing pages).
- Don't regress existing behavior when porting a view unless the change is requested.
