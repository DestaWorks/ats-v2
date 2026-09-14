# Commercial model — how firms buy and use DestaHealth ATS

**Status:** decisions taken with Leliso 2026-09-11, **pending Biruh's confirmation on pricing and
tier contents**. Nothing here is built beyond what the "Already built" column says.

This is the engineering side of `BUSINESS-CASE-SAAS.md`. That document asks Biruh what we sell;
this one records what was decided, what it costs to build, and what is still open.

---

## Decisions taken

| | Decision | Consequence |
| --- | --- | --- |
| **Billing period** | **Annual**, paid up front | One invoice per customer per year. Manual invoicing is correct at this scale — **no Stripe, no webhooks, no dunning, no card-on-file, no PCI surface** |
| **Pricing shape** | **Per recruiter seat** for the base, **flat per firm** for tiers | Seats already exist as `Membership`; `seatLimit` is already a column |
| **Packaging** | **Fixed bundles: Starter / Growth / Scale** — not à la carte | `Tenant.plan` IS the entitlement. No per-tenant override column, no console toggle. Deletes Phase B of `module-entitlements.md` |
| **Routing** | **Subdomain per tenant** — `acme.destahealth.com` | Already implemented (`readTenantClaim` → `fromHost`); slugs are already DNS labels with a reserved list |
| **Onboarding** | Undecided — **self-serve vs sales-led is open** | See "Open for Biruh" |

### Why per-seat, and not per-placement

Per-placement pricing sounds aligned — we earn when they earn — and is the wrong choice.

It gives the customer a financial reason **not to use the product properly**: recording a hire
costs them money, so hires get recorded late, off-system, or not at all. That corrupts the exact
data the ATS exists to hold, makes our pipeline reports fiction, and turns us into auditors of our
own customers. Revenue also goes lumpy and disputable.

The same objection rules out revenue-share and any percentage-of-fee model.

Per-seat is also what a buyer expects: a staffing firm evaluating us has already priced Bullhorn,
Loxo, Crelate and JobAdder, all per-user-per-month. Being unusual about pricing is friction in a
sale we are otherwise making on familiarity ("built by a staffing firm").

### What annual costs us, and what pays for it

Annual makes the **first sale harder** — twelve months up front from a firm that has not heard of
us, with no "try it for a month" escape hatch.

**The trial carries that weight.** With monthly, a bad fit costs a customer one month. With annual,
the trial is the only de-risking they get, so it has to be real (30 days), generous, and it has to
actually end. That makes trial expiry load-bearing rather than cosmetic — see the gap below.

---

## The tiers

As currently coded in `PLAN_MODULES`. **These contents are a placeholder written during the module
design, not a commercial decision anyone has made.** Biruh owns them.

| | Core ATS | Compliance | Sourcing | Reports | Discovery & CRM | AI | Client Portal |
| --- | :-: | :-: | :-: | :-: | :-: | :-: | :-: |
| **Starter** | ✓ | ✓ | | | | | |
| **Growth** | ✓ | ✓ | ✓ | ✓ | | | |
| **Scale** | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| *trial* | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| *internal* | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |

The ladder tells a story worth keeping: **run your desk → grow your candidates → grow your
clients.** Each tier answers a different question the firm is asking that year, which is what makes
an upgrade feel obvious rather than extractive.

`internal` is Desta Works' own workspace — the vendor is not a customer and buys nothing. It exists
as a plan because the seeded tenant already carried that value, and leaving it out of the
vocabulary silently collapsed our own workspace to `starter` and stripped six modules from it.

### Two questions about the tiers

1. **Client Portal in Scale only?** It is the one feature the customer's *clients* touch, which
   makes it our best retention mechanism. Premium placement is defensible; so is moving it to
   Growth to get it into more hands.
2. **Should the trial grant everything?** It currently does. Best demo, worst downgrade: a firm
   trials the full product, gets used to Reports, buys Starter and watches it disappear. The
   alternative — trial the tier they are buying — is more honest and a weaker pitch. Current
   recommendation: keep the full trial, and rely on the upsell screen, which already says "your
   plan doesn't include this" rather than "forbidden".

### The number that matters most is the gap, not the price

If Starter is $80/seat and Growth is $95, nobody upgrades — the modules are not worth $15. If
Growth is double Starter, everyone stays on Starter and resents it. The spacing between tiers *is*
the pricing model. Biruh knows what Desta Works itself would have paid; that is the anchor, not a
competitor's list price.

---

## Subdomain routing — what it changes

Already implemented: `readTenantClaim` resolves a tenant from **path > subdomain > cookie**, slugs
are DNS labels (`^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$`), and `www`/`app`/`api`/`admin`/`mail`/
`cdn`/`staging` and others are reserved in both directions — a subdomain claim ignores them and
provisioning must refuse them.

Three things change when we deploy this way:

### 1. The session cookie — a real decision, not config

| | Shared on `.destahealth.com` | Per subdomain |
| --- | --- | --- |
| Switching workspaces | Seamless | Sign in again each time |
| Blast radius | One cookie jar for every tenant | Isolated |

**Recommendation: shared.** The architecture already assumes the tenant cookie is worthless on its
own — `dw_tenant` holds a slug, and the server re-verifies it against a live membership on every
request, so tampering buys a 403 and never data. The Better Auth session cookie identifies a
*person*, not a workspace; the membership lookup decides the tenant. Per-subdomain cookies would
punish exactly the multi-workspace users the model exists to support.

### 2. CORS stops being an allowlist

`apps/api` currently takes `WEB_ORIGINS` as a comma-separated list and the file is explicit about
why it is never `origin: true`: the session travels in a cookie, so a reflected origin with
`credentials: true` lets any site a signed-in user visits read the API.

Per-tenant subdomains cannot be enumerated. Two ways out:

- **Pattern match** `https://<valid-slug>.destahealth.com`. Small, security-sensitive, wants review.
- **Avoid the problem**: serve the API from `api.destahealth.com` and keep all fetching
  server-side, which is already how `apps/web` works since Phase 4.3. **Check whether anything in
  the browser calls the API directly before building the pattern matcher** — it may be unnecessary.

### 3. Infrastructure

- Wildcard DNS: `*.destahealth.com`
- **Wildcard TLS**, which Let's Encrypt only issues via a **DNS-01** challenge — the DNS provider
  needs an API and the renewal automation needs credentials for it.

**This is the operational risk of the whole choice.** One certificate sits in front of every
customer, so a failed renewal is a total outage rather than a degraded one. Worth deciding whether
we run that on a VPS ourselves or let a platform terminate TLS.

A side benefit: `admin.destahealth.com` gets its own origin, which removes the cookie tug-of-war
between the operator app and the console that exists on shared `localhost` today.

---

## What has to be built before we can charge

Short, because the bundle decision deleted most of it.

| | Work | Why it blocks selling |
| --- | --- | --- |
| 1 | **Enforce trial expiry** | `trialEndsAt` is read only for DISPLAY. `tenantIsUsable` checks `deletedAt` and `suspended` and nothing else, so **an expired trial works forever**. With annual billing that is a free product, and the trial is our only de-risking |
| 2 | **Enforce `seatLimit` at invite** | The column is read for display and enforced nowhere. A firm on 3 seats can invite 30 |
| 3 | **A paid-until date** | There is `trialEndsAt` and nothing for a paid term. We need to know when a year ends, and the health check should warn ahead of it the way it already warns on trials |
| 4 | **Create-tenant in the console** | **There is no way to create a tenant through the product.** No `POST /tenants`, no `POST /platform/tenants`. Today a workspace exists because a migration or a seed script inserted a row |

Each of 1–3 is roughly half a day. Item 4 depends on the onboarding decision below.

Non-payment is already handled: the console has suspend/restore, with a closed reason vocabulary
that writes into the suspended tenant's own activity log, and a restore that derives its target
status from `trialEndsAt` rather than silently promoting a suspended trial to `active`.

### One thing to make durable if AI is ever metered

The AI usage ledger is a **fire-and-forget write**. It is fine as telemetry and wrong as revenue
data — a metered bill computed from a log that silently drops rows is a billing bug. AI is the one
module with real per-tenant marginal cost, so it is the one most likely to be metered.

---

## Open for Biruh

1. **Tier contents** — the table above is a placeholder. What actually goes in Starter, Growth and
   Scale?
2. **Price per seat, and the gap between tiers.** The gap is the pricing model.
3. **Self-serve signup, or sales-led provisioning?** Recommendation: **sales-led**, and the reason
   is compliance rather than engineering. We treat this data as PHI (D9), so a **signed BAA has to
   exist before a firm loads a clinician's licence number**. A self-serve form lets a stranger
   start loading PHI at 2am with no agreement in place. Sales-led is also far less to build — a
   create-workspace form in the console we already have, rather than signup, verification, plan
   selection, payment-before-provisioning and fraud handling.
4. **Who is the paying customer, and which entity receives the money?** US firms in USD points at
   Stripe; Ethiopian firms in ETB rules it out (Chapa/Telebirr, and manual invoicing). With annual
   billing this may never matter, but it decides the answer if it does.
5. **Client Portal tier** and **trial scope** — the two tier questions above.
6. **Are slugs immutable?** A slug is the workspace's identity in the URL, the cookie and
   eventually the TLS certificate. If a firm rebrands, every bookmark breaks. Cheapest answer:
   immutable, set at provisioning, changed only by us with a redirect. Decided now it is a line in
   a form; decided after a customer asks it is a migration.

---

## Related

- `docs/BUSINESS-CASE-SAAS.md` — the same questions from the business side, for Biruh
- `docs/design/module-entitlements.md` — why entitlement and capability are separate axes, and how
  the module gate is enforced
- `docs/SAAS-RESTRUCTURE-PLAN.md` Phase 9 — the original "sellable" checklist, most of which the
  annual + bundles decision removes
