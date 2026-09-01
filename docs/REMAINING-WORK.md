# Remaining work

Everything known to be outstanding, in the order it should be done. Audited 2026-09-01 against a
tree where all ten CI gates pass, there are zero `TODO`/`FIXME`/`HACK` markers in source, and zero
skipped tests.

**How to read the priorities.** P0 blocks launch outright. P1 must be true before real data or
real users touch the system. P2 is real debt with a known cost. P3 is worth doing when convenient.

| | | |
|---|---|---|
| **P0** | [Phase 7 — the data migration](#p0--phase-7-the-data-migration) | Nothing else matters until this exists |
| **P0** | [Owner decisions](#p0--decisions-only-the-owner-can-make) | Cheap to answer, block other work |
| **P1** | [Encryption coverage (H2)](#p1--h2-encryption-covers-2-of-9-sensitive-columns) | Docs claim more than the code does |
| **P1** | [`xlsx` advisories](#p1--xlsx-two-high-advisories-with-no-npm-fix) | Two HIGH, no fix on npm |
| **P1** | [Verify alpine + `sharp`](#p1--verify-image-optimisation-under-musl) | Unproven at runtime |
| ~~P2~~ | **All four P2 items are done** — see [Done](#done-for-reference) | 2026-09-01 |
| **P3** | [Playwright, or drop the claim](#p3--playwright-or-stop-claiming-it) | Claimed, absent |
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

## P0 — Decisions only the Owner can make

None of these are engineering. Each blocks something.

1. **Where the containers run.** The images build and run; nothing in the repo names a host. Also
   decides the registry the deploy workflow pulls from.
2. **The production domain and database.** `zyx.com` is still a placeholder. Today's environment
   is staging.
3. **The `system` actor for imported records.** Deferred to the migration discussion — Phase 7
   needs an answer.
4. **`docs/CLIENT-BRIEF.md`** — it is a record of what was sent to the client in July, now carrying
   a correction banner. Keep the corrections, or revert it to exactly as sent?

---

## P1 — H2: encryption covers 2 of 9+ sensitive columns

From `SECURITY-AUDIT-APP.md`, still open.

Only `Candidate.licenseNumber` and the resume extraction output pass through `encryptField`.
`Candidate.email`, `phone`, `name`, `CandidateNote.body` and the entire `SourceLead` table
(`npi`, `email`, `phone`, `notes`) have **no encryption path at all** — not "the key is off", but
never wired.

**The sharp edge:** the docs claim NPI and contact fields are encrypted at rest. They are not.
Either widen the coverage or correct the claim — but not neither, because a claim that outruns the
code is worse than an honest gap.

**Also unresolved:** there is no backfill. The design is encrypt-on-next-write, so rows written
before the key was set stay plaintext indefinitely.

---

## P1 — `xlsx`: two HIGH advisories with no npm fix

`xlsx@0.18.5` carries Prototype Pollution and ReDoS. The fix is `>=0.20.2`, but **npm stops at
0.18.5** — SheetJS publishes only to their own CDN now.

Used by `apps/web/src/app/(app)/sourcing/lib/lead-import.ts` to parse uploaded spreadsheets in the
browser.

**Three options, all needing a decision:**

- install from the SheetJS CDN (changes where a dependency comes from),
- replace it with a maintained parser for the narrow use,
- accept the risk in writing, noting it is client-side and operator-triggered.

---

## P1 — Verify image optimisation under musl

The images moved to Alpine. `sharp` (Next's image optimiser) publishes musl builds and the build
passes — but **a build passing does not prove image optimisation works at runtime**.

**Test:** load a page using `next/image` with optimisation from the running container and confirm
the image renders and is actually transformed. Ten minutes, and it closes the last unknown from
the Alpine switch.

---

## P3 — Playwright, or stop claiming it

`STACK-ARCHITECTURE.md` and `SAAS-RESTRUCTURE-PLAN.md` both name Playwright for critical E2E flows.
It is **in no manifest and there are zero e2e specs**. Both now carry an honest caveat, so this is
tracked rather than false.

Either adopt it for the handful of flows worth a real browser — sign-in, add/move candidate,
promote lead, parse resume — or remove the aspiration from the standards table.

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
