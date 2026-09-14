# Selling by module — entitlements, and where roles end

**Status:** written 2026-09-04 as a proposal. **A and C shipped 2026-09-11; B has not been built.**
The reasoning below stands as the record of why it is shaped this way — where the build diverged
from the proposal, the section says so.

---

## The problem this solves

The product is going to be sold **by module** — a firm buys the ATS and chooses whether they also
want Sourcing, Discovery, Reports or AI. Nothing in the codebase expresses that today.

The instinct is to model it through roles, because roles already gate features. That instinct is
wrong, and this note is mostly about why.

## Two axes, never one

| | scope | question it answers |
| --- | --- | --- |
| **Entitlement** | the **tenant** | has this firm PAID FOR Reports? |
| **Capability** | the **membership** | may THIS USER view Reports? |

Access requires both:

```
allowed = tenantHasModule(module) AND userHasCapability(capability)
```

**Why they must stay separate.** Sell modules through roles and three things follow:

1. A commercial change — someone buying an add-on — reaches into the access-control model.
2. Downgrading a customer means rewriting their users' roles. Re-upgrade and you have to
   reconstruct what each person had; that information is gone.
3. "Director" means something different in every tenant depending on what they bought, so nobody
   in support can reason about it.

Kept apart, a downgrade flips one flag on the tenant. Nobody's role changes, and re-upgrading
restores exactly what was there.

## A third axis, so it does not get merged later

Entitlements and capabilities are two of three. The third is **feature flags**, and the industry
distinction is worth writing down before anyone needs one:

| | question it answers | scope |
| --- | --- | --- |
| **Feature flag** | should this CODE run yet? | release, experiment, kill switch |
| **Entitlement** | is the customer contractually allowed? | tenant |
| **Capability** | may this user do it? | membership |

Nothing here needs flags today. It is recorded because the documented failure is teams merging the
first two: flags then become permanent, can never be retired, and the combinations multiply — ten
booleans are a thousand code paths. The related failure is drift, where the flag system and the
billing system each believe they own the answer, and free users see a paid feature for two days
until somebody notices.

If a kill switch is ever needed, it is a separate mechanism from `@RequireModule`.

## What already exists

`Tenant` has carried the field since Phase 6:

```prisma
plan        String    @default("trial")
seatLimit   Int?
trialEndsAt DateTime?
```

**None of it gates anything.** `plan` is read in two places — displayed in the platform console and
counted in metrics. `seatLimit` is read nowhere, which matters the moment anyone is charged per
recruiter.

## The design smell this exposes

The capability list is already doing two jobs. Split by what each one actually is:

**Module-shaped — these are entitlements wearing permission clothes:**

| capability | call sites |
| --- | --- |
| `viewCrm` | 13 |
| `viewReports` | 11 |
| `viewClientDiscovery` | 7 |
| `configureClientPortal` | 4 |
| `viewAnalytics` | 2 |
| `manageAiSettings` | 2 |

**Genuinely permissions — they describe a person, not a purchase:**

`viewCredentials` (10), `manageUsers` (6), `bulkImport` (4), `viewAudit` (4), `purgeCandidate` (3),
`manageRoles`, `manageAccessRequests`, `viewAllNoteTypes`, `deleteOpenRole`.

The first group works fine for one customer and breaks the moment a firm buys Sourcing but not
Discovery: there is no way to express that, because the only lever is a role, and a role is about
the person.

`viewCredentials` is the clearest counter-example, and worth keeping in view — it gates licence
numbers, the PII tier. It must stay a **capability**, because whether a screener may see a licence
number has nothing to do with what the firm bought.

## Proposed modules

| Module | Screens | Notes |
| --- | --- | --- |
| **Core ATS** | candidates, pipeline, dashboard, screening, trash | Always included. Not sellable — it is the product |
| **Sourcing** | sourcing, discover | Leads and outreach, pre-pipeline |
| **Discovery / CRM** | crm, client-discovery | B2B prospecting. Carries the Apollo + Hunter keys |
| **Reports** | reports | The eleven reports |
| **AI** | resume, daily-brief, weekly-brief | The only module with real marginal cost per customer |
| **Client Portal** | portal (external) | The client-facing view |
| **Compliance** | credentials, license-verify | Licence tracking and verification |

**AI prices itself** — it is the one module that costs money per tenant to run, so it is the
natural metered add-on rather than an arbitrary split.

## Not a 403

An unentitled module is **not** forbidden. `403` means "you may not"; this is "your plan does not
include this", which is an upsell and a different message. It needs its own error code so the UI
can show the right thing rather than an access-denied page a customer reads as a bug.

## The plan

### A — Make modules real. No UI. **Shipped, minus the navigation hiding.**

- A `Module` vocabulary in `domain`, and a static `PLAN_MODULES` map: which plan includes what.
- `TenantContext` carries the tenant's resolved modules alongside its capabilities.
- A `@RequireModule("reports")` decorator beside `@RequireCapability`, and both must pass.
- The new error code, so the client can distinguish "not paid for" from "not allowed".
- Web hides a module's navigation when the tenant lacks it — UX only. **The server is
  authoritative**, exactly as it already is for capabilities.

**Done when:** a tenant on a plan without Reports gets the upsell response from every reports
endpoint, and a test proves the check cannot be satisfied by capability alone.

**Shipped:** a `Module` vocabulary, `PLAN_MODULES`, `TenantContext.modules`, `@RequireModule` on 21
controllers, and `PLAN_UPGRADE_REQUIRED` → **402** (not 403 — see "Not a 403" above). Both
`SessionAuthGuard` and `CapabilityGuard` enforce it through one shared `enforceDeclaredModule`,
because a decorator that only worked under one of them would silently enforce nothing on routes
attaching the other. `scripts/check-module-gates.mjs` proves an enforcing guard is always attached
and fails on four separate ways the gate could go quiet.

**Still outstanding:** the web app does not yet hide a module's navigation when the tenant lacks it.
The server is authoritative either way, so this is UX rather than a hole — a member on a plan
without Reports currently sees the link and gets the upsell response on clicking it.

### B — Let the platform console change them. **Not built.**

- A per-tenant module toggle in `apps/admin`, which is platform-only and already gated by
  `PLATFORM_ADMIN_USER_IDS`.
- Every change audited. Downgrades take effect immediately and destroy no data, so an upgrade
  restores the module with its records intact.
- Enforce `seatLimit` at invite time, since per-seat pricing is meaningless otherwise.

**Done when:** enabling and disabling a module for a tenant is a two-click operation that writes an
audit row, and a suspended module hides itself from that tenant's navigation on the next request.

**Not started.** Modules are derived from `Tenant.plan` alone, so changing what a workspace has
means changing its plan. `seatLimit` still gates nothing, which matters the moment anyone is
charged per recruiter.

### C — Tenant-managed roles. **Built, and the deferral was reversed on timing.**

The original recommendation was to defer this until a customer asked, on the grounds that most
customers never touch the defaults and an editor buys support load for a feature nobody requested.
That reasoning was right about the FEATURE and wrong about the CLOCK, which is what decided it:

**the migration was free while the database was empty.** `Membership.role` → `Membership.roleId`
sits on the authorization hot path. Doing it before the Phase 7 data import cost one migration
against nothing; doing it afterwards would have meant migrating live memberships. Same work, much
worse day.

What shipped:

- **`access_roles`**, per-tenant rows seeded by cloning the six built-in templates.
  `ROLE_CAPABILITIES` in `domain` is now the TEMPLATE the seed clones from, not the runtime answer.
- **`Membership.roleId`, NOT NULL**, with a **composite** foreign key on `(roleId, tenantId)` →
  `(id, tenantId)`. A membership holding another tenant's role is unrepresentable rather than
  merely rejected — which is a stronger guarantee than the RLS policy it replaces, and the reason
  `AccessRole` can be a global model at all.
- **`TenantContext.capabilities`**, resolved once per request from the tenant's own row.
  `hasCapability` takes the VIEWER, not a role name — a name cannot answer the question any more,
  because two workspaces may both have a "Director" that grants different things.
- **The editor**, grouped by module, cloning from a template, with an effective-permissions view.

Four guards, none optional:

1. **A workspace must keep at least one member who can manage it.** The pattern already exists —
   `countActiveByRole(ADMINISTRATIVE_ROLES)` guards member removal today.
2. **You may only grant permissions you hold.** Otherwise a Manager edits a role and becomes an
   administrator.
3. **Clone from a template, never start empty** — the documented cure for role explosion.
4. **An effective-permissions view**: this user, this role, these permissions, and which module
   each came from. Built with the feature, not after, or every "why can't Sarah see reports?"
   becomes an engineering question.

The editor groups permissions by module and MARKS the ones whose module the workspace has not
bought, rather than hiding them — hiding would make a role silently grant more than the screen said
the day that module is added. That is what makes the two systems compose instead of confusing each
other.

**One guard is deliberately vacuous today.** Nothing can currently trip "you may only grant what you
hold", because the only templates granting `manageRoles` grant everything. It is written anyway,
and `roles.test.ts` pins the invariant that makes it vacuous — grant `manageRoles` to a narrower
role and that test fails, naming the guard. A guard that has to be REMEMBERED at that moment is a
guard that will not be there.

## Prior art

The shape here follows the consensus for B2B multi-tenant SaaS: a base set of role templates with
tenant-level overrides, rather than either fixed roles or a free-for-all.

- [WorkOS — designing multi-tenant RBAC](https://workos.com/blog/how-to-design-multi-tenant-rbac-saas)
- [Aserto — dynamic RBAC with custom roles](https://www.aserto.com/blog/building-dynamic-multitenant-rbac-custom-roles)
- [Permit.io — RBAC vs ABAC vs ReBAC](https://www.permit.io/blog/rbac-vs-abac-and-rebac-choosing-the-right-authorization-model)

Two of the pitfalls those name have already occurred in this codebase, which is the reason to take
the rest seriously rather than as generic advice:

- **"Role checks assuming global scope"** — the cross-tenant admin finding of 2026-09-04, where
  `removeUser` and `banUser` acted on the global account rather than the workspace membership.
- **"Stale permission caches create temporary privilege persistence"** — capabilities are resolved
  per REQUEST and never cached beyond one, or a revoked permission would outlive its revocation.
  A role change takes effect on the target's very next request, like removal.

**ReBAC is not the answer here.** Zanzibar-style systems solve sharing graphs — documents, nested
folders, "shared with me". An ATS is role-shaped, and adopting that model would be large complexity
for a problem this product does not have.

**ABAC, later, if asked.** "This recruiter sees only their own candidates" is an attribute rule and
is the most likely first request. Add it when a customer asks for it, not before.

## What this does not decide

- **Which plans exist and what they cost.** That is a commercial decision; this note only assumes
  a plan maps to a set of modules.
- **Billing.** Nothing here charges anyone. Modules make the product *sellable by module*;
  collecting the money is separate and still unbuilt.
- **Per-tenant module overrides.** Modules are derived from `Tenant.plan` alone. B's platform
  console toggle needs a column to store an override against; that is a small migration, not a
  redesign.
