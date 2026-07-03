# Estimate & 3-Month Delivery Plan (Locked)

The committed plan: **secure core + full recruiting funnel in 3 months**, with the remaining
tail (CRM analytics + heaviest reports) landing inside 3 months if velocity holds and otherwise
in a **short fast-follow**. Solo (Leliso) working AI-assisted, **5 days/week × 8 h = 40 h/week**.
Organized into **7 waves**.

> **The 3-month clock starts at T+0 = keys/data provided**, not at "yes." T+0 is the day Biruh
> has provisioned the keys (Claude API, **two Supabase projects — staging + prod**, Vercel,
> Google OAuth), granted **domain/DNS access** (for `zyx.com` + `staging.zyx.com`) and Apps
> Script access, and delivered a data export. Every day of delay before T+0 shifts the finish
> date one-for-one — the clock cannot start on a promise.

**Why this pace is real (the accelerators):**
- **1:1 UI port** — the existing UI is reused, not redesigned; front-end work is translation.
- **Better Auth ships RBAC built-in** — the role/permission system isn't hand-built.
- **AI-assisted build** — schema, CRUD, forms, repositories, and tests are generated fast.

> Estimation basis and the research behind the velocity live at the bottom of this doc. Numbers
> are **build hours** for a functionally-complete rebuild; hardening continues after cutover.

---

## The 7 waves

| Wave | Theme | Modules | Hours | Month |
|:---:|---|---|---:|:---:|
| **0** | Foundation | Scaffold/CI, DB schema, rules engine, API skeleton, **Auth/RBAC**, **FE baseline** (forms, skeleton/empty/error states, print, responsive) | 72 | 1 |
| **1** | Data In | Bulk Import + **multi-entity migration/ETL**, Parse Resume | 54 | 1 |
| **2** | Core Loop + funnel cutover | Pipeline, Candidate Detail, Add Candidate, Cross-cutting (alerts/mentions/trash/audit), **Sourcing, Discover/NPPES** | 113 | 1–2 |
| **3** | Feeders (finish) | Screening, Verify (assisted queue), **Credentials Intelligence**, **Smarter Sourcing**, Open Roles | 72 | 2 |
| **4** | Clients & Comms | Templates, **CRM (+ analytics)**, Client Portal | 83 | 2–3 |
| **5** | Intelligence & Admin | Overview + **Daily accountability loop (Targets/Daily Log)**, Daily/Weekly Brief, Reports, Perf, Admin, Profile, Learn | 135 | 3 |
| **6** | Cutover & Decommission | QA + hardening, retire Sheet/Apps Script, delete legacy file | ~40 | 3 |

Each wave is **independently shippable and demoable**, and depends only on the waves before it.

> **Split-brain reorder (D2):** Sourcing + Discover move up out of Wave 3 to sit *with* the
> candidate/pipeline cutover, so **find → promote → pipeline all go live on the new app in one
> coordinated event.** There is no window where a legacy "promote" writes a candidate the new
> pipeline can't see; until a domain is ported, legacy writes to it are frozen/redirected (no
> dual-run). This is why Wave 2 is heavier and straddles the Month 1→2 boundary — the funnel
> cuts over together.

---

## Per-module hours (all 25 + foundation)

| # | Module | Hours | Days | Wave |
|---|---|---:|---:|:---:|
| — | **Foundation** (scaffold, CI/CD, DB schema, rules engine, API skeleton, tests) | 40 | 5 | 0 |
| — | **FE baseline** (react-hook-form + zod, Skeleton/EmptyState/ErrorState, print stylesheet, responsive/mobile pass) | 16 | 2 | 0 |
| 1 | Auth & Access (+ RBAC) | 16 | 2 | 0 |
| 20 | Bulk Import / Migration | 24 | 3 | 1 |
| — | **Multi-entity ETL** (leads, notes, clients/contacts/deals, historical activity — `legacy_id`, email-primary dedupe, merge policy, résumé→profile confidence match) | 12 | 1.5 | 1 |
| 8 | Parse Resume | 18 | 2 | 1 |
| 3 | Pipeline | 26 | 3 | 2 |
| 4 | Candidate Detail | 22 | 3 | 2 |
| 5 | Add Candidate | 4 | 0.5 | 2 |
| 24 | Cross-cutting (alerts/mentions/trash/audit) | 15 | 2 | 2 |
| 6 | Sourcing | 28 | 3.5 | 2 |
| 7 | Discover / NPPES | 18 | 2 | 2 |
| 9 | Screening | 12 | 1.5 | 3 |
| 10 | Verify — **assisted queue (v1)** (candidates-to-verify, one-click state-board links, editable status, expiry timeline) | 6 | 1 | 3 |
| 25 | Credentials Intelligence (`matrix` — verification queue, expiry, coverage) | 12 | 1.5 | 3 |
| — | **Smarter Sourcing (B4)** — net-new "find providers *like this one*" similarity (distinct from Open-Roles matching existing candidates to a role) | 14 | 2 | 3 |
| 12 | Open Roles | 28 | 3.5 | 3 |
| 11 | Templates | 12 | 1.5 | 4 |
| 13 | **CRM** (+ analytics engines) | 62 | 8 | 4 |
| 14 | Client Portal | 9 | 1 | 4 |
| 2 | Overview / Home (+ "since you closed") | 16 | 2 | 5 |
| 17 | Daily Log & Journal (+ Today's Targets) | 15 | 2 | 5 |
| 15 | Daily Brief | 20 | 2.5 | 5 |
| 16 | Weekly Brief | 20 | 2.5 | 5 |
| 18 | Reports | 30 | 4 | 5 |
| 19 | Perf | 6 | 1 | 5 |
| 21 | Admin | 18 | 2 | 5 |
| 22 | My Profile | 5 | 0.5 | 5 |
| 23 | Learn | 5 | 0.5 | 5 |

**Build subtotal:** ~529 h · **+ ~10% buffer** (~53 h) · **Grand total ≈ 582 h ≈ 14–15 weeks.**

> **Honest net effect of the review additions.** The pre-implementation review added real,
> non-optional hours — **FE baseline (+16), multi-entity ETL (+12), the assisted-verify queue
> (kept, not dropped), and Smarter Sourcing (+14)** — plus the earlier **Credentials Intelligence
> (+12)**. These are *not* free. The result: the **secure core (Month 1) + full recruiting funnel
> (Month 2) still land inside 3 months**, but **full parity (CRM analytics + heaviest reports)
> may spill a week or two into a short fast-follow.** That is acceptable and already allowed by
> the client brief — it is the deferrable tail flexing, never the core or the funnel.

> **Not counted in the 3-month core (explicit fast-follows):**
> - **Verify automation** — real per-state automated license checks (spike + per-state adapters,
>   partial coverage): ~20–30 h, ships after cutover. v1 is the *assisted* queue above.
> - **CRM analytics depth + the heaviest report types** if the risk areas run heavy (see safety valve).

---

## Month-by-month

### Month 1 — Secure core (Waves 0–2, into the funnel cutover)
Foundation + **FE baseline** → Auth/RBAC → Bulk Import + **multi-entity ETL** → Parse Resume →
Pipeline → Candidate Detail → Add → Cross-cutting → **Sourcing + Discover** (the funnel cutover
begins here and completes at the top of Month 2, so find → promote → pipeline go live together).
**Ships:** secure login with real roles, all historical data in a real database, a working
pipeline, candidate folders, and sourcing feeding it. *Legacy pipeline + sourcing can be retired
as one.*

### Month 2 — Funnel finish + CRM (Wave 3 + start of Wave 4)
Screening → Verify (**assisted queue**) → Credentials Intelligence → **Smarter Sourcing** →
Open Roles → Templates → CRM (records + the churn/sentiment/deal/contact analytics).
**Ships:** the full recruiting funnel and client management.

### Month 3 — Intelligence + finish (rest of Wave 4 → Waves 5–6)
Client Portal → **Overview + daily accountability loop (Targets/Daily Log)** → Daily/Weekly Brief
→ Reports → Perf → Admin → Profile → Learn → **QA + hardening + cutover.**
The **daily accountability loop is pulled forward inside this wave and protected** — it's Step 10
of the flagship daily flow, not an optional extra. **Everything live, the old Sheet/Apps Script
system retired** — with CRM analytics depth + the heaviest reports as the only items that may
flex into a short fast-follow.

---

## Roles (for the RBAC in Wave 0)

**Fixed 6 built-in roles:** Owner · Director · Manager · Screener · Associate · **Admin** (a
Prisma/zod-validated enum; an account is exactly one role, `admin` is a role value — not a
separate boolean flag).
- **"Leadership"** = a **capability group in code** (Owner/Director/Manager/Admin), not a separate
  role — guards check capabilities (e.g. `can('viewReports')`) mapped from role, not hardcoded
  role lists.
- **Custom-role creation is deferred to v2.** v1 ships the fixed 6 + capability groups.
- **Client** = a separate external portal-access type, isolated from internal RBAC.

---

## What "done in 3 months" means (read this)

This is a **tight, zero-slack plan.** "Done" = **functionally complete and working**, not every
edge case exhaustively tested. The model is **ship, then harden.** The plan holds *only* if the
conditions below hold.

### Non-negotiable conditions
1. **Clock starts at T+0 = keys/data provided** — the 3-month count begins the day Biruh has
   provisioned the keys (Claude API, **two Supabase projects — staging + prod**, Vercel, Google
   OAuth), granted **domain/DNS access** (`zyx.com` + `staging.zyx.com`) and Apps Script access,
   and delivered a data export — **not** the day the work is approved. Every day between "yes" and
   T+0 pushes the finish date one-for-one.
2. **Zero scope creep.** New feature ideas go to a **v2 list**, never into these 3 months.
3. **MVP-per-module discipline** — core function first, polish later.

### The three real risks to the date (these don't shrink with UI reuse — they're *logic*)
- **Data migration correctness** — moving real PII (multi-entity ETL) into Postgres, verified,
  no loss.
- **CRM analytics** — churn/sentiment/deal-probability/contact-strength engines.
- **Reports computations** — the 9 report types, esp. Mass Journey.

### The safety valve
If anything slips, the **deferrable tail slips first — never the core, the funnel, or the daily
loop.** The flex/risk-buffer is now **CRM analytics depth + the heaviest report types** (still
shipped, but first to move into a short fast-follow if time runs short). **Protected — never
deferred:** the secure core (Month 1), the recruiting funnel (Month 2), and the **daily
accountability loop** (Overview "since you closed" + Today's Targets + Daily Log), which was
pulled *out* of the deferrable tail because it's daily-driver, Step-10 functionality. Learn and
Perf remain the smallest, lowest-risk trims.

---

## Honest range

- **Committed (this pace):** secure **core + full recruiting funnel + daily loop in 3 months**;
  full 25-module parity at **~582 h ≈ 14–15 weeks** with the review additions folded in.
- **Expected:** full parity lands right around the 3-month line; if the three risk areas run
  heavy, **CRM analytics depth + the heaviest reports slip into a short fast-follow (≈ weeks
  13–15)** — the core, funnel, and daily loop still land inside 3 months.
- **Absolute floor if things go sideways:** secure core + full funnel + daily loop in 3 months,
  CRM-analytics/heaviest-reports as a month-4 fast-follow, and Verify automation always a
  fast-follow. (This is the fallback, not the plan.)

---

## Success metrics (measurable acceptance)

The rebuild is judged against numbers, not vibes:
- **Page load:** primary screens interactive in **< 2 s** on a normal connection (vs the current
  in-browser rebuild-every-visit).
- **Concurrent users:** **≥ 25–50** simultaneous internal users with no queuing/timeouts (vs the
  Google-Sheet ceiling of a few dozen that degrades under a team pilot).
- **Migration accuracy:** **100%** of in-scope records migrated with **zero PII loss**, verified
  against migration golden-files; résumé→profile matches above the confidence threshold, the rest
  routed to manual confirm.
- **Pipeline responsive at scale:** kanban + candidate lists stay responsive at **≥ 50k
  candidate records** (the Sheet-era cliff).

**Rollout / UAT:** each wave ships behind a per-wave recruiter **UAT sign-off** and a documented
**rollback path** (revert to the still-live legacy view) if a ported screen misbehaves in
production; a short **"which app for which task, by month"** cheat-sheet keeps live users
oriented while both apps run side by side.

---

## Estimation basis

- Bottom-up per-module, sized from the complexity ratings in `MODULE-BREAKDOWN.md` (Logic/Impl).
- Velocity anchored to: 1:1 UI reuse (front-end = translation), Better Auth's built-in RBAC
  ([better-auth.com/docs/plugins/admin](https://better-auth.com/docs/plugins/admin)), and
  AI-assisted build (Prisma schema + CRUD + tests generated).
- Auth benchmark: managed-library auth is an "afternoon-to-days," not the 2–3 weeks of
  from-scratch ([WorkOS 2026 guide](https://workos.com/blog/nextjs-app-router-authentication-guide-2026)).
- **Biggest uncertainty:** solo velocity (±40%). The conditions and safety valve above exist to
  absorb it.

*Locked 2026-07-01. Supersedes the rougher timelines in `PLAN.md` and `MIGRATION-PLAN.md`.*
