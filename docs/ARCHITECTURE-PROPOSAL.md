# Architecture Decision — Structure for a Multi-Tenant SaaS

**For:** Desta Works leadership and the engineering team
**Status:** Decision required on one question.

**Settled:** the ATS becomes a multi-tenant SaaS product sold to other staffing agencies.

**Open:** do we build that on the current single-tree codebase, refactoring it in place, or do we
restructure into a monorepo first and build it there?

Both options deliver the same product. They differ in what foundation it sits on, what it costs to
get there, and what it costs to live with afterwards. Every number quoted was counted against the
actual codebase; the appendix explains how.

---

## 1. Where we stand

The application is Next.js, TypeScript, Prisma and PostgreSQL, layered route → service → repository
→ database, with typechecking, linting and tests enforced on every change. Waves 0 through 3.5 are
live with real users and real personal data.

| | |
|---|---:|
| Source files, excluding generated code | 801 |
| API routes / server-rendered pages | 141 / 39 |
| Service files / methods | 34 / 171 |
| Repository files / methods | 35 / 243 |
| Database tables | 41 |
| Test files / tests | 213 / 1,410 |
| **Database calls outside the repository layer** | **2** |

Four properties decide the price of everything below:

- **Repositories are the only code that touches the database** — two exceptions, both on a table
  that stays shared under multi-tenancy. This is the single seam tenant scoping needs.
- **No role names are hardcoded anywhere.** Every permission check asks for a capability. Change
  where a role is read from and all 141 routes keep working.
- **111 of 117 server files have no dependency on the web framework.**
- **Per-client scoring rules already live in a database table**, not in code.

Most of the groundwork for multi-tenancy is already done. A codebase this size without these
properties would cost two to three times what follows.

### What is missing today

- No background job runner and no scheduler — slow work runs on the web request.
- No concept of a tenant.
- Nine routes publish every database column to the browser by definition, so any column added in
  future is exposed automatically.
- No route declares what it returns, while the browser assumes a shape in 82 places.
- Fourteen pages read the database directly, bypassing the service layer.
- The lint rule meant to enforce our layer boundaries is pointed at directories where it cannot
  fire. "No database access outside repositories" is documented and unchecked. The search indexes
  are protected by a code comment, and have been dropped three times.

---

## 2. What multi-tenancy requires — the same in both options

This work is identical whichever structure we choose. It is the constant, not the variable.

- Two new tables, for tenants and memberships. Role moves onto the membership, so one person can be
  Owner at one agency and Associate at another. Identity stays shared.
- **37 of 41 tables gain a tenant column.** Four stay shared — identity and sessions.
- **Seven uniqueness rules re-keyed per tenant.** Two agencies may legitimately source the same
  practice. One of the seven is hand-written SQL and is the only guard against duplicate leads.
- Tenant scoping injected at the single function every repository already uses to reach the
  database. **243 repository methods gain one argument and no new logic** — scoping becomes
  impossible to forget rather than something 243 places must remember.
- Database-level row security underneath, so a query that escapes the application returns nothing
  rather than another agency's data.
- A platform-admin capability on a different axis from a tenant's Owner. **This is a second
  application** — different audience, different permission model.
- An isolation test suite proving, table by table and on every change, that one tenant cannot reach
  another's data.
- Existing data migrates by adding the column as optional, backfilling to the first tenant, then
  making it required. Safe under live traffic at our volumes.

**Two things are true in both options and are not part of the choice.** First, the codebase needs
hardening before either: nine tangled files, the four routes that publish every column, service
methods for the fourteen pages that skip the layer, a clock module and a money module, per-route
response types, and real lint rules. Second, we need a job runner — slow work on web requests is the
only gap actively hurting the running system, and a worker can use the existing service code
unchanged.

---

## 3. Option A — Refactor the current structure in place

Keep the single source tree. Harden it, then add everything in section 2 directly on top.

**How the boundary is held:** by a lint rule. "Nothing outside the repository layer touches the
database" becomes an automated check rather than a line in a document.

**Sequence:** harden → job runner → multi-tenancy → migrate the legacy Sheet data → split into
packages later, when the platform-admin console forces it.

| For | Against |
|---|---|
| No structural churn during the highest-risk work | The repository layer gets touched twice — once for tenancy, again when packages arrive |
| The team keeps working in a tree it already knows | The database boundary stays a lint rule, which can be disabled with a comment on the line |
| Revenue-blocking work starts immediately | CI keeps rebuilding and retesting everything on every change, through the whole tenancy effort |
| Smallest total change in flight at any one time | The platform-admin console arrives with no home, forcing the restructure anyway — later, under more pressure |

---

## 4. Option B — Restructure to a monorepo, then add SaaS

Split the tree into packages first, with dependency direction enforced by the build, then do the
same multi-tenancy work inside it.

```
apps/
  web/                 the operator application
  admin/               platform-admin console — required by SaaS
packages/
  domain/              constants, rules, validation, time, money   (no dependencies)
  db/                  schema, generated client, repositories
  api/                 services, auth, http, ai, email, integrations
  ui/                  shared interface components
tooling/
  eslint, prettier, tsconfig, tailwind presets
```

**How the boundary is held:** by the package graph. The database package is simply not importable
from anywhere that should not have it. Not a rule — a fact about how the project is assembled.

**Sequence:** harden → restructure, one package per pull request → job runner → multi-tenancy →
migrate the legacy Sheet data → the admin console lands in a structure that already has a place for
it.

| For | Against |
|---|---|
| The database boundary becomes impossible to bypass, not merely checked | Delays revenue-blocking work by the length of the restructure |
| The repository layer is touched **once**, in its final home | Moving 800 files at once is inherently hard to review |
| The platform-admin console has a home the day it is needed | Churn in import paths, CI and editor tooling while it settles |
| Per-package caching speeds up CI across the long tenancy effort | No user-visible benefit on its own |
| Eighty thousand lines of generated database code walled off from the browser by construction | Adds a "which package does this belong in?" decision to every new file |

---

## 5. Comparison

| | Option A — refactor in place | Option B — restructure first |
|---|---|---|
| **Code quality** | Layering enforced by a lint rule; the same tree, tidier | Layering enforced by the build; boundaries cannot be crossed by accident |
| **Performance** | Unchanged | Unchanged — packaging has no runtime effect |
| **Security** | Good: the exposed-column defect closed, tenancy scoped at one seam, isolation proven by tests | Better: the database boundary is structural, so a bypass is not expressible in code |
| **Scalability — system** | Identical. Same queries, same hosting, same ceilings | Identical |
| **Scalability — team and codebase** | Degrades as apps are added; the admin console has nowhere to live | Designed for it; adding an application is adding a directory |
| **Delivery impact** | Revenue work starts sooner | Revenue work starts later, then moves faster |
| **Cost of the restructure** | Paid later, after tenancy, re-touching the same files | Paid once, before tenancy |
| **Risk profile** | One very large change | Two large changes, sequenced and separable |
| **Team impact** | Low disruption throughout | High disruption up front, then stable |

### Performance — neither option affects it

Splitting the source tree changes where code lives on disk, not what runs at request time. Multi-
tenancy adds one indexed column to every query, which is negligible and sometimes faster, since a
tenant-scoped index narrows a scan that today covers the whole table. Row-level security adds a
small per-query cost and needs care around connection pooling — the one place tenancy could cost
performance if done carelessly.

The only change that makes the system measurably faster to use is the job runner, and it is in both
options.

### Security — the deciding difference

Under a single tenant, a stray database call outside the repository layer is a layering smell. **Under
multi-tenancy, it is a query with no tenant filter — which is a cross-tenant data leak, which in a
system holding medical professionals' personal information is a reportable breach.**

The same defect changes category entirely once we have a second customer. That reframes how the
boundary should be held. A lint rule is a real control, and it is what Option A relies on — but it
can be switched off with a comment on the line, and under deadline pressure it sometimes is. A
package boundary cannot be. Option B makes the breach vector inexpressible rather than merely
detected.

Both options include the isolation test suite and row-level security, so both can prove isolation.
The difference is how many independent layers have to fail before data crosses a tenant line.

### Scalability

For the system, the two are identical — same queries, same hosting, same ceilings. Our current
constraints are database connection pooling, then hosting plan limits, then slow work on web
requests. None is close, and the job runner addresses the one that bites.

For the codebase, they diverge sharply, and multi-tenancy is what forces the issue. **A platform-admin
console is not optional under SaaS** — supporting customers requires a plane that sits outside any
one tenant. That is a second application with a different audience and a different permission model.
Option B has a place for it. Option A does not, which means the restructure happens anyway, later,
with more code to move and a live customer base watching.

---

## 6. Recommendation

**Option B. Restructure to the monorepo first, then build multi-tenancy inside it.**

This is a change from the earlier draft of this document, and the reason is worth stating: that draft
recommended keeping the current structure, on the grounds that a monorepo needs a second application
to justify it and we did not have one. **Deciding on SaaS supplies that second application.** The
platform-admin console is required, not hypothetical, so the argument for deferring no longer holds.

Four reasons, weighted:

**1. Security changes category.** A missing tenant filter is a reportable breach, not a code smell.
Option A defends that with a lint rule that can be disabled on the line; Option B makes it
structurally impossible. When the failure mode is a breach, the stronger guarantee is worth the
cost — and this is the argument that decides it.

**2. We touch the repository layer once instead of twice.** Multi-tenancy rewrites 243 repository
methods. Under Option A we rewrite them, then move them later when the admin console forces packages.
Under Option B we move them first, then rewrite them in their final home. Same work, done once.

**3. The restructure is not optional under SaaS — only its timing is.** The admin console needs
somewhere to live. Doing the move now, with one operator and a codebase we control completely, is
cheaper and safer than doing it later with paying customers on the system.

**4. It matches the standard we set for this project.** The brief was a solid, standard foundation we
build once rather than repeatedly. The pattern this codebase keeps repeating is a rule that is
written down and not enforced — a lint rule aimed where it cannot fire, commit conventions nothing
checks, a database rule nothing tests, indexes guarded by a comment and dropped three times. Option B
is the one that breaks that pattern instead of adding to it.

### What we accept by choosing it

Revenue-blocking work starts later. The team absorbs disruption up front — import paths, CI, editor
tooling — during a stretch that ships nothing a user sees. And moving 800 files is genuinely hard to
review.

That last risk is the one that matters, and it is manageable only with discipline that is not
optional: **one package per pull request; existing import paths kept working throughout; every move a
pure file move with zero content edits, so each diff is verifiable at a glance; the full 1,410-test
suite green between each.** If we cannot hold that discipline, Option A is the safer choice — but the
discipline is the price of the guarantee, not a nice-to-have.

### The order of work

1. **Harden** — nine tangled files, the exposed-column routes, service methods for the fourteen
   pages, clock and money modules, per-route response types, real lint rules
2. **Restructure** — tooling, then domain, then database, then api, then interface, then the
   application; one package per pull request
3. **Job runner** — move slow work off web requests
4. **Multi-tenancy** — everything in section 2
5. **Migrate the legacy Sheet data** into the tenant-aware schema
6. **Platform-admin console** as a second application

**Step 5 must come after step 4.** Importing the legacy data into a single-customer schema and then
altering 37 tables underneath it costs materially more than the reverse, and the importers are only
two files deep today.

### Two decisions already taken, recorded here

**The API contract is contract-first typed REST.** The browser assumes a response shape in 82 places
and none of our 141 routes declare one; today that is caught by shared typechecking, but only because
both sides compile together. REST rather than a compile-time-typed scheme, because a second
application will not always ship in lockstep with the server, the client portal already serves people
outside the company, and HTTP caching and curl-ability matter in production. Every route declaring
what it returns is part of the hardening step.

**Moving the backend to NestJS is deferred.** We already have the layering, framework-independent
services, server-side capability-based guards, validation on every route and consistent error
handling. What it would add that we lack is dependency injection, which no current problem calls for,
and background jobs — which the job runner solves without touching 141 audited routes. Revisit if a
public partner API becomes a product requirement, or if long-running and stateful work becomes
central rather than something a queue absorbs.

### Still outstanding regardless

The migration importers are written but not committed and their actor map is unfilled; application
errors are not reaching error monitoring; there are no timeouts on database connections; nine
questions about legacy field mapping are unresolved; and the repository is still public while
containing client names.

---

## Appendix — How the numbers were measured

Counted against the working tree, not estimated.

| Figure | How it was counted |
|---|---|
| 41 tables, 37 needing a tenant column | Table declarations in the schema, minus the four identity and session tables |
| 243 repository methods across 35 files | Method signatures in the exported repository objects |
| 171 service methods across 34 files | Method signatures in the exported service objects |
| 141 routes, 39 pages, 213 test files, 801 source files | File counts under the application tree, excluding generated code |
| 1,410 tests | A full run of the test suite |
| 82 assumed response shapes against 0 declared | A search across browser call sites and route handlers |
| 111 of 117 server files free of the web framework | A search for framework imports under the server tree |
| **2 database calls outside the repository layer** | A full search excluding generated code, the repository layer and tests. Both are on a table that stays shared under multi-tenancy, so neither is an isolation risk today — but both are exactly the class of defect that becomes a breach vector once a second tenant exists |
