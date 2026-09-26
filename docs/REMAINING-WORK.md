# Remaining work

Everything known to be outstanding, in the order it should be done. Audited 2026-09-01 against a
tree where CI is fully green — six jobs (commit messages · static · test · tenant isolation ·
build · e2e), with twelve separate checks inside `static` alone — there are zero
`TODO`/`FIXME`/`HACK` markers in source, and zero skipped tests.

**Re-audited 2026-09-25:** the Playwright P3 is done (259 specs, and the `e2e` job above is new
since the first audit). Everything else below stands — Phase 7 is still the only P0.

**How to read the priorities.** P0 blocks launch outright. P3 is worth doing when convenient.
P1 and P2 are empty — those tiers were cleared on 2026-09-01/02; see [Done](#done-for-reference).

| | | |
|---|---|---|
| **P0** | [Phase 7 — the data migration](#p0--phase-7-the-data-migration) | Nothing else matters until this exists |
| ~~P2~~ | **All four P2 items are done** — see [Done](#done-for-reference) | 2026-09-01 |
| ~~P3~~ | ~~[Playwright, or drop the claim](#p3--playwright-or-stop-claiming-it)~~ | **Done 2026-09-25** — 259 specs |
| **P3** | [`storageKey` prefix check](#p3--storagekey-prefix-check) | Deliberately deferred to Phase 7 |
| **P3** | [Prisma WASM trimming](#p3--trim-unused-prisma-query-compilers) | ~47MB per image |

---

## P0 — Phase 7: the data migration

**Status: not started.** `SAAS-RESTRUCTURE-PLAN.md` says so itself — the importers are not in the
repo. There is no `scripts/migrate/`.

**Why it is P0:** deploy today and you get an empty ATS. Every other item on this page is polish
by comparison.

**What it involves:** `docs/MIGRATION-GAP-ANALYSIS.md` already has the per-tab plan —
migrate / derive / drop. What does not exist is the code that reads the legacy Sheet and writes
Postgres, plus the reconciliation that proves nothing was lost.

**Do first:** a rehearsal. Restore a copy of the real data into a throwaway database, run all 49
migrations against it, and see what breaks. Non-destructive, and it is the only way to find out
what the Sheet actually contains versus what the schema expects.

---

## ~~P3 — Playwright, or stop claiming it~~ — DONE 2026-09-25

Adopted, and well past the "handful of flows" this entry asked for. **259 specs across 48 files**,
run from a throwaway Postgres on every CI run, with a step-summary report.

Coverage was measured rather than asserted: the suite runs with the API request log captured, and
every declared route is diffed against every route that actually executed. **177 of 209 handlers
execute**; of the 184 in scope (the platform console, Credentials and Client Discovery are
excluded), **7 remain unreached**, every one of them needing a live model provider or object store.
37 of 40 pages render; the 3 that do not are out of scope or dev-only.

All 14 capability gates are covered from the denied side, and every destructive path asserts the
row is actually gone rather than trusting a 200.

**Found and fixed along the way:** a taken email answered 500 instead of 409; `ban`/`remove` had no
server-side self-lockout guard (the UI disabled the buttons, the API did not); and a failed enqueue
left a migration run stranded at `queued` forever. Three tests that were passing for the wrong
reason — asserting a 422 that came from an unknown key rather than the value under test — were
repaired.

**Known limits:** one browser at desktop width (no mobile, Safari, Firefox or visual regression);
no accessibility assertions; 29 of 67 button labels have no click-path test, their handlers being
covered at the API instead.

---

## P3 — `storageKey` prefix check

`persistedStorageKey` accepts any string and signs it, with the prefix check deliberately deferred
to the Phase 7 backfill (documented at `packages/integrations/src/storage.ts`). Doing it earlier
would reject legacy un-prefixed keys during the import.

**Sequencing is the point:** it lands *with* Phase 7, not before.

---

## P3 — Trim unused Prisma query compilers

`@prisma/client` ships a WASM query compiler per database — PostgreSQL, MySQL, SQLite, SQL Server,
CockroachDB — at ~9.4MB each. Your schema is PostgreSQL only, so **~47MB per image is never
loaded**. Prisma acknowledge this ([prisma#29095](https://github.com/prisma/prisma/discussions/29095)).

**Not done deliberately.** It means deleting files inside a dependency, and if a future Prisma
version resolves those paths differently the failure appears as a **runtime crash on the first
query**, not at build time. 47MB is not worth that class of risk. Revisit when Prisma ships
provider-specific packages.

---

## Done, for reference

So the list above is not mistaken for the whole picture:

- Cross-tenant admin plane closed; regressions verified to fail when reverted; two new CI rules
  (`global-model-lists-carry-a-predicate`, `audit-writes-name-a-tenant-when-nothing-else-can`).
- Report and fit-ranking truncation surfaced instead of silent.
- Portal audit write fixed before it broke on migration day.
- Migrations apply on deploy; Sentry armed with the PII scrubber shared by both runtimes.
- Containerised: one `Dockerfile`, five targets, all built and verified running. 8.4GB → ~2.2GB.
- `apps/web` has its own manifest; the root has no runtime dependencies; the lockfile holds one
  resolution per package.
- The API image runs `npm ci` from committed manifests, with a CI check that its pins match
  `pnpm-lock.yaml`.

**The four open decisions, settled 2026-09-02** — three of them dissolved on inspection:

- **PHI:** assumed, and recorded as `DECISIONS.md` D9. Not a legal ruling — the safe default,
  because assuming PHI costs a pricier host and assuming wrong is a reportable breach. It settles
  hosting: a provider that signs a BAA, Postgres on a droplet rather than a managed service,
  Supabase retired (~$949/mo against ~$72), Redis local rather than hosted.
- **LGPL:** not a question after all. `next/image` is used in no screen, and a search of all five
  container images for `sharp`/`libvips` returns nothing — it exists only in the build workspace
  and is distributed nowhere, which is what LGPL's obligations attach to. Recorded in the licence
  gate with a note to re-check if `next/image` is ever adopted.
- **`xlsx`:** both HIGH advisories gone. Swapped to `@e965/xlsx@0.20.3` — the same SheetJS code
  above the patched version, on npm so the lockfile pins it by integrity hash, Apache-2.0. No
  feature lost; the tests passed unchanged, which is what proves the API is identical.
- **`sharp` under musl:** moot. It is in no image and `next/image` is used in no screen, so
  there is no image optimisation to verify. The same finding that settled the LGPL question
  closed this one.
- **H2 encryption:** the claim was corrected, not the code. `email` is the dedupe key and name,
  email and phone are searched and sorted — none of which works against ciphertext with a random
  IV. `licenseNumber` is encrypted precisely because it is neither searched nor sorted. Doing more
  properly needs deterministic encryption or blind indexes, which is a project rather than a flag.
  `DATA-MODEL.md` now states what is true and why the rest is not.

**P2 closed 2026-09-01** — and two of the four turned out to be different from how they were filed:

- **SBOM + licence gate** (NDA §5b). `pnpm license:check` fails on any licence nobody has
  reviewed; `docs/THIRD-PARTY-LICENSES.md` is generated from pnpm's own resolution of the
  lockfile. Built on `pnpm licenses list`, so no new dependency and no second view of the graph.
  **It found something on the first run:** `@img/sharp-libvips` is **LGPL-3.0-or-later**, which
  NDA §5b says needs the Owner's *prior written consent*. Recorded as awaiting consent, not
  silently approved.
- **`React.cache()` → `requestMemo`.** The wrapper memoized nothing outside a React render, and
  since 4.3 those helpers run only in NestJS and the worker — so it was dead everywhere it
  executed. Replaced with an `AsyncLocalStorage` memo scoped per request in the API and **per job
  attempt** in the worker, because a cache outliving either would serve one tenant's rows to the
  next. Six tests, including one that proves scopes do not leak.
- **Escape-hatch ratchet — the target was wrong, not the code.** All 26 uses are the tenancy plane
  (`membership.repository.ts` PRODUCES the context every other repository demands), the seam
  itself, or tests of the seam. "Drive it to 0" would mean deleting the app's ability to resolve
  which tenant a user is in. The check now reports **inherent 22 / fixtures 4 / debt 0**, with a
  written reason per exemption, and the plan was corrected to match.
- **Test-credibility sweep — the mocks were mostly defensible.** 21 suites mock the audit writer,
  but redaction is already covered by `audit.test.ts` and the `tenantId` contract is now enforced
  statically across `packages/application`. Rewriting 21 mocks would have been motion; instead the
  contract itself gained tests where it belongs. One test was deleted on writing it, because
  `exactOptionalPropertyTypes` makes the case it covered unrepresentable.
