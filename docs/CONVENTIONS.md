# Engineering Conventions — DestaHealth ATS

Standards for the **new** codebase. The legacy `index.html` is exempt (it is being
strangled, not maintained). These exist so the project is reviewable, testable, and safe to
ship continuously.

**Base document: [`SAAS-RESTRUCTURE-PLAN.md`](./SAAS-RESTRUCTURE-PLAN.md).** It defines the target
architecture, the engineering standards and the phased plan for getting there. This file is the
day-to-day working version of those rules; **where the two conflict, the plan wins**, and this file
is the one that gets corrected.

---

## 1. Source control & workflow

### 1.1 Branching — while the restructure is in progress

**`main` is not worked on.** It stays exactly equal to what is deployed, so there is always an
unambiguous answer to "what are our users running?" It is merged into once, at the end of the
programme, with a merge commit — never a squash, because every commit reaching it was already
reviewed on the way in.

| Branch | Cut from | Merges into | Purpose |
|---|---|---|---|
| `main` | — | — | Deployed truth. Hotfixes only |
| `restructure` | `main` | `main`, once, at the end | The integration base. Every phase lands here |
| `<type>/p<N>-<slug>` | `restructure` | `restructure` | One concern, short-lived |
| `fix/<slug>` | `main` | `main`, **then down to `restructure` the same day** | Hotfix |

Branch names carry their phase so history reads as the plan: `chore/p0-clock-module`,
`refactor/p2-pkg-domain`, `feat/p6-tenant-schema`.

**A hotfix that has not been merged down to `restructure` by end of day is a defect, not a state to
tolerate.** Divergence is what kills long-lived branches.

### 1.2 Worktrees

The workspace layout changes during the restructure, so `node_modules` does not match across
branches and switching in place means repeated reinstalls. One worktree per concurrent line of work:

```
~/Documents/biruh/
├── desta-ats/          restructure — primary, all phase work
├── desta-ats-main/     main — hotfixes only
└── desta-ats-wt/<task> per-task, cut from restructure
```

```bash
git worktree add ../desta-ats-wt/p2-domain -b refactor/p2-pkg-domain restructure
git worktree remove ../desta-ats-wt/p2-domain    # when its PR merges
```

Rules, each learned the hard way:

- **Verify the base before working.** A worktree created by tooling is cut from whatever `HEAD`
  pointed at, which is not necessarily the branch you meant. `git log --oneline -1` first.
- **Environment files do not follow a worktree**, and that is a safety feature. Link deliberately:
  the hotfix worktree gets `.env` (shared infrastructure); task worktrees get local values only.
- **Never put `DATABASE_URL` or `DIRECT_URL` in `.env.local`.** Next.js prefers `.env.local`, but
  the **Prisma CLI reads only `.env`** — split them and the app and your migrations talk to
  different databases while both appear to work.
- **Each worktree needs its own `pnpm install`.** Install lazily; a hotfix worktree does not need
  dependencies until there is a hotfix.
- **Tooling must exclude nested worktree paths.** ESLint flat-config `ignores` anchor at the repo
  root, so `.next/**` does not match `.claude/worktrees/*/.next`. Use `**/.next/**`.

### 1.3 Parallel work and merging

When several branches run at once:

1. **Compute file overlap before assigning the work**, and give overlapping files to one owner
   where possible. Tell each owner which files another is touching.
2. **Merge in ascending order of overlap** — least entangled first — so each conflict is resolved
   once, against work already landed.
3. **Run `typecheck`, `lint` and `test` between every merge**, never only at the end. A conflict
   resolved wrongly is cheapest to find immediately.
4. **`git apply --3way` stages what it applies.** A following `git add <one-file>` and commit will
   sweep everything staged into that commit. Check `git show --stat` before moving on.
5. **After the last merge, re-run the invariant checks** — the boundary greps, not just the suite.
   Branches that are each green can still combine to undo one another: a parallel change reopened
   the `next/headers` boundary another had just closed, and **no test failed**. Invariants must be
   asserted as invariants.

### 1.4 Everything else

- **Trunk-based with short-lived branches.** Branch from the integration base, open a PR, merge
  when green.
- **No whole-file uploads.** Every change is a reviewable diff. (The current
  "Add files via upload / Delete index.html" history stops now.)
- **Branch protection on `main`**: require PR + passing CI + at least one review.
- **Conventional Commits**: `feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `chore:`,
  `security:`. Subject ≤ 72 chars, imperative mood. **Enforced** by commitlint
  (`commitlint.config.mjs`) via a husky `commit-msg` hook; a husky `pre-commit` hook runs
  lint-staged (Prettier + `eslint --fix`) over staged files.
- **Small PRs.** One concern per PR. A ported view is fine; a 9,000-line dump is not.
- **No secrets in git.** `.env` is gitignored; commit `.env.example` with keys, not values.
- **Promotion path (DECISIONS D6):** branch → per-PR preview URL → merge to `staging`
  (QA on `staging.zyx.com`) → merge to `main` (production `zyx.com`). Staging and production run
  on **separate Supabase projects**; **migrations and the data migration run staging-first, then
  production.** Never author schema directly against prod.

## 2. Languages & tooling

- **TypeScript everywhere.** All six are on in `tooling/typescript/base.json` and none may be turned
  off to make a diff compile: `strict`, `noUncheckedIndexedAccess`, `noUnusedLocals`,
  `noUnusedParameters`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`.
- **No `any` in application code.** No non-null assertion (`!`) used to silence a nullable — narrow
  it or handle it. An `as` cast requires a comment saying why the compiler cannot know. External
  data is `unknown` until a zod schema proves otherwise.
- **Formatting**: Prettier (single source of truth — no style debates in review).
- **Linting**: ESLint (typescript-eslint, react-hooks). CI fails on lint errors. The layer
  boundaries are **machine-enforced, not just documented** — and the authority is
  `scripts/check-architecture.mjs` (`pnpm arch:check`), which reads the real import graph rather
  than a path pattern: every allowed package edge is declared in `ALLOWED_DEPENDENCIES`, Prisma may
  be imported only inside `@destaworks/db`, `@destaworks/domain` must have zero runtime
  dependencies, no package may import an app, no cycles, and `apps/web`/`apps/admin` may not import
  `db` or `application`. Every exemption carries a written reason and, where it is debt, the plan
  for removing it. `import/no-restricted-paths` in `tooling/eslint` backs this up inside a package.
- **Package manager**: pnpm, lockfile committed. Under the monorepo, one version of each shared
  dependency via pnpm `catalog:`, and Turborepo for the task graph and caching.
- **Node**: pin the version (`.nvmrc` / `engines`).
- **Commits**: enforced by commitlint via a husky `commit-msg` hook; a `pre-commit` hook runs
  lint-staged (Prettier + `eslint --fix`) over staged files.

## 3. Project structure

**Target (monorepo): `docs/SAAS-RESTRUCTURE-PLAN.md` — "Target structure" and "Where today's code
goes".** That plan is the base document for the restructure; where anything here conflicts with it,
the plan wins. It defines the `@destaworks/*` package graph, the dependency law, and which of
today's directories each package is assembled from — including that **`src/lib` does not move as a
unit**, because parts of it carry React, Sonner, Better Auth and Sentry and `domain` must stay
dependency-free.

**Phase 2 landed: there is no `src/` tree any more.** Client feature code stays co-located under
`apps/web/src/app/(app)/<feature>/`; everything that was `server/**` is a package
(`application`, `db`, `auth`, `integrations`, `config`) and the API layer is `apps/api`. Do not
invent a parallel `features/` + `domain/` + `api/` tree, do not recreate `src/modules/`, and do not
reintroduce a `@/*` alias that spans packages — Phase 2.10 retired those, and retiring them is what
exposed three misfiled modules the mapping had missed. This section only adds file-size/complexity
conventions on top.

- **One component per file.** No 9,000-line files; flag any file > ~400 lines in review.
- **No giant components.** If a component has more than a handful of `useState`, extract
  hooks/subcomponents. (The legacy `App()` with ~180 hooks is the anti-pattern we're fixing.)

## 3a. Repository-layer reuse rules

- **Never redefine `db(...)`.** Import the shared seam from `@destaworks/db` — since Phase 6.3 it is
  `db(ctx, tx?)`, and the `TenantContext` is what injects `tenantId` into every `where` and `data`.
  Do not reimplement it per repository, and do not add a repository method that omits the context:
  `pnpm tenant:check` fails on one.
- **Never rebuild an id→name lookup by hand.** Use `clientRepository.nameMap()` (or the
  equivalent for the entity in question) instead of `new Map(rows.map(r => [r.id, r.name]))` at
  each call site — one query pattern, one place to optimize.
- **Project narrow reads with `select`.** A read that only needs a few columns for scoring/
  matching/lookup (not the full entity) should get its own repository method with an explicit
  Prisma `select` (see `leadRepository.listForMatching()`) — don't fetch full rows (PII included)
  just to read 3–4 fields.
- **Share one fetch across sibling reads on the same page load.** If two service methods would
  each independently fetch the same unbounded/expensive dataset for one page (e.g. two scorers
  both reading "every lead"), add a composite method that fetches once and returns both results,
  and have the RSC loader call that instead of `Promise.all`-ing the two originals.

## 3b. One home per concern (DRY)

The recurring defect in this codebase is the same logic living in several places and drifting —
`utcDayStart` existed three times with two different end-of-day rules, and the Activity Log and the
candidate list disagreed about what "to = 30 June" meant. Each concern has one home:

| Concern | Lives in |
|---|---|
| Wire shapes | `@destaworks/contracts` |
| Business rules, stage gates, scoring | `@destaworks/domain` |
| Time — "today", day boundaries, expiry | `@destaworks/domain` — `clock.ts` + `daily.ts` |
| Money arithmetic | `@destaworks/domain` — `money.ts` |
| Database access | `@destaworks/db` |
| Tenant scoping | the `db(ctx)` seam in `@destaworks/db` |
| Permission decisions | capability checks in `@destaworks/auth` |
| Error mapping | one Nest exception filter, over the shared `classifyError`/`errorEnvelope` |
| Logging | `@destaworks/config` — the `Logger` interface, never Pino directly |

A PR that introduces a second implementation of any of these is rejected.

**Business logic is told the time, it never asks for it.** No ambient `new Date()` inside a rule or
service: pure rules take a `Date` instant, composition roots take a `Clock` (`systemClock` in
production, `fixedClock` in tests). A default parameter of `new Date()` IS the ambient read, just
hidden in a signature. Day windows are half-open `[start, end)` — adjacent days tile with no gap,
and an inclusive `23:59:59.999` bound silently drops rows, because Postgres stores microseconds.

**Money is integer minor units with an explicit currency** (`@destaworks/domain`'s `money.ts`). A float amount is
unrepresentable, and the major/minor factor comes from the currency's scale — never a literal 100.

## 4. Naming

- **Files**: `kebab-case.ts` / `PascalCase.tsx` for components.
- **Components**: `PascalCase`. **Hooks**: `useCamelCase`. **Vars/functions**: `camelCase`.
- **Constants/enums**: `UPPER_SNAKE` for module constants; real `enum`/union types for domain
  values (status, role, track, license status) — not bare strings scattered around.
- **No cryptic abbreviations.** The legacy code uses names like `sV`, `sFC`, `vw`, `sAE` —
  do not carry these over. Names should be self-explanatory (`setView`, `currentView`).

## 5. State & data

- **Server state = RSC reads + `lib/api/client.ts`'s typed fetch helpers — not TanStack Query
  or any other client cache library (DECISIONS D7, which now carries explicit revisit criteria).**
  Since Phase 4.3 the RSC read fetches from `apps/api` over HTTP rather than calling a service
  in-process (`SAAS-RESTRUCTURE-PLAN.md` 4.0, Option A). That hop is **not cached**: `apiGet`
  forwards the caller's session cookie and sets `no-store`, because the response is specific to one
  session and gated by that caller's capabilities, so caching it would serve one user another's
  rows. Frontend apps must never import `@destaworks/db` or `@destaworks/application` — there is one
  path to data, it is the API, and the edge is banned in `ALLOWED_DEPENDENCIES` rather than merely
  discouraged. The page's `page.tsx` (RSC) guards, reads through `lib/api/server.ts` and passes DTOs
  down as props; mutations go through
  `getJson`/`postJson`/`patchJson`/`putJson`/`deleteJson`, which return a discriminated
  `ApiResult<T>` (`{ok:true,data}` / `{ok:false,failure}`). **Never call `fetch()` directly in a
  component** — add a one-line wrapper in the feature's `lib/*-fetch.ts` instead, so every
  mutation gets the same failure shape for free. On success, either `router.refresh()` (re-runs
  the RSC read) or an in-place `setState` patch; on failure, `issues.length` → `form.setError`,
  else `messageForFailure(failure)` + a Sonner toast. Optimistic UI uses React's `useOptimistic`
  + `useTransition`, not manual snapshot/rollback bookkeeping.
- **No business logic in components.** Scoring, disqualification, and stage-gate rules live
  in `@destaworks/domain` and are **server-authoritative**; the client may mirror them for UX only.
- **No `localStorage` for auth/role.** Session is provider-managed; role comes from the API.
- **Saved views / filters:** shareable filter and saved-view state lives in a `saved_views`
  table + URL `searchParams` (so a view can be linked and reloaded) — **not** `localStorage`.
  `localStorage` is only for non-sensitive UI prefs (e.g. collapsed-panel, theme). Filter
  toolbars are built on the shared `app/(app)/lib/filter-toolbar.tsx` primitives
  (`FilterToolbar`/`FiltersPopover`/`FilterField`) + `use-url-filters.ts` — not a bespoke card
  per feature.
- **Forms:** use **react-hook-form + `zodResolver`** via the shared `useZodForm` hook (share
  the zod schema with the API boundary); no hand-rolled `useState`-per-field forms. Coerce
  empty-string `<input>`/`<select>` values to `null` with the shared `emptyToNull`/
  `emptyToNullNumber` (`lib/forms/empty-to-null.ts`), not a per-form reimplementation.
- **Dates**: store ISO 8601 UTC; format at the edge. Don't compute SLAs from local time.
- **Offset-paginated lists** use the shared `PageMeta`/`pageMeta()` (`lib/pagination.ts`) for the
  envelope/math and the shared `<Pager>` (`components/ui/pager.tsx`) for the footer UI — not a
  per-list reimplementation of either.

## 6. API & validation

**The contract model is contract-first typed REST** (`SAAS-RESTRUCTURE-PLAN.md` — "How the API
contract works"). Wire shapes live in one place — `@destaworks/contracts` — and both sides import
them. Nothing infers a shape from an implementation detail.

- **Every endpoint declares its response type**, and the client imports that declaration rather than
  asserting one. This stopped being a compile-time nicety when 4.3 split the API into its own
  process: `apps/web` and `apps/api` no longer typecheck together at runtime, so a shape the
  endpoint never promised is now a silent runtime failure, and the shared contract is the only
  thing standing between the two.
- **Requests**: one zod schema per endpoint, `.strict()`, so unknown keys are rejected rather than
  ignored. Validated once at the boundary — never re-validated in a service, never trusted from
  the client.
- **Responses**: resources are returned bare — no `{ data: ... }` wrapper.
- **No endpoint returns a raw database row, and no DTO is defined by omission from a model.**
  `Omit<XRow, "secret">` publishes every future column automatically; declare the published,
  capability-gated and withheld field lists explicitly and map field by field.
- **Errors are always enveloped**: `{ error: { code, message, issues?, ref? } }`, `code` drawn from
  the fixed union in `@destaworks/integrations/http/app-error`. An unexpected error never leaks its message — it
  becomes `INTERNAL` with a `ref` that ties the response to a PII-free log line.
- **Pagination — two shapes, chosen by what the UI needs.** Keyset `{ items, nextCursor, hasMore }`
  is the default for feeds and unbounded lists. Offset `{ items } & PageMeta` is correct where the
  product shows numbered pages, because a pager needs `total`/`totalPages`. Use `PageMeta` from
  `lib/pagination.ts`; never hand-roll the fields.
- **Validate every boundary** with zod; share schemas between client and server.
- **Resource-oriented endpoints**, not a single multiplexed `event` switch.
- **Authorize every endpoint** server-side by role. UI hiding is UX, never security.
- **Writes return results.** No fire-and-forget `mode:"no-cors"`.
- **Audit every state change** (actor, action, entity, before/after, timestamp).
- **Reuse the shared query-param preprocessors** — a `"1"`/`"true"` presence flag is
  `boolFlagSchema` (`lib/validation/pipeline.ts`), not a per-schema reimplementation of the same
  `z.preprocess`. A `page` param's parse strategy (`.optional()` + service-side `?? 1`, vs.
  `.catch(1)` to silently recover a bad value) is a **deliberate per-endpoint choice, not
  drift** — don't "fix" one to match the other without checking whether that endpoint's tests
  document the recovery behavior on purpose.
- **DTO envelopes extend the shared shape, not repeat its fields.** An offset-paginated list DTO
  is `{ items } & PageMeta` (`extends PageMeta` from `lib/pagination.ts`), not six duplicated
  `total`/`page`/`pageSize`/… fields.

## 7. Security rules (non-negotiable — NDA-binding)

- Never trust the client for authentication or authorization.
- **Never log PII/PHI** (names, emails, phones, license #, NPI, patient data) — and this is
  enforced structurally, not by vigilance. Use `logger` from `lib/logger`; `console.*` is banned
  outside tests by lint. The logger's signature is `(event, fields)` with no format string, so a
  value cannot be interpolated into a message, and PII keys are redacted before serialization.
  Errors are reduced to their type: **Prisma embeds the offending field VALUES in its messages.**
  Every line carries the request's `requestId`, which is the same id returned to a client as
  `error.ref`.
- **Audit vs. logs are different systems.** The `activity_log` table (`before`/`after`)
  **intentionally** stores PII, under access control (capability-restricted reads) and
  encryption at rest — it is the compliance audit trail. **Application and observability logs
  (Sentry, structured stdout) must never contain PII/PHI.** Do not conflate the two: audit is
  a governed data store, logs are operational telemetry.
- **Enforce layer boundaries with off-the-shelf lint** (`eslint-plugin-boundaries` /
  `import/no-restricted-paths`) plus `import "server-only"` — not hand-written AST rules. This
  keeps Prisma out of components and services out of the client bundle.
- **No secrets in code, ever.** Env vars and the host's secret store only — never in an image
  layer, which is why the `Dockerfile` takes no secret as a build argument; the **Owner
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
- **Tenant isolation** — once multi-tenancy lands, every tenant-scoped repository has a test
  seeding two tenants and asserting one cannot read the other's data. Run on every PR; this is the
  proof of isolation, not a belief in it.
- **Boundary invariants are asserted as invariants**, not inferred from a green suite. Branches
  that each pass can combine to undo one another — a parallel change reopened the `next/headers`
  boundary another had just closed and no test failed. The architecture checks in CI exist for
  exactly this.
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

## 9a. Definition of done for a PR

Format · lint · typecheck · dependency and architecture checks · unit tests · integration tests ·
contract tests · build — all green. Authorization enforced server-side. Inputs validated at the
boundary. Mutations audited. No PII in logs. Conventional commit message. One concern per PR.

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
