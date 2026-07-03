# Project Context — Engagement, Company, Constraints

Non-code context for the DestaHealth ATS work, captured from the client onboarding documents
(Engineering Projects Overview, Company/Role/Ways of Working, and the Developer NDA, all
dated June 26–27 2026). This is the "why and under what rules" behind the technical docs.

## Engagement

- **Owner / client:** Biruh Mezgebu (Desta Works). Non-engineer; built the current systems to
  get the business moving. Sets product priorities and direction.
- **Engineer:** Leliso Agegnehu — Desta Works' **first full-stack engineer**. Owns codebases,
  delivery, and **engineering standards** (repo structure, review, maintainability).
- **Reporting & decisions:** Report directly to Biruh. **Technical "how" is the engineer's**
  to decide and defend within agreed scope. Product **"what/when" decided together**.
  **Security-sensitive items (API keys, billing, patient data) go through Biruh** — build
  against them, never hold the keys.
- **Ways of working:** WhatsApp, async-first (a clear written update beats a status meeting);
  one weekly face-to-face; both in Addis (timezone overlap), watch US client/patient time for
  live pilots. Flag blockers **early and specifically**: "blocked on X, need Y." Biruh values
  **clarity over polish, honesty over good news** — surface late/fragile/wrong things first.

## Company

- **Desta Works** — the operating company (staffing, operations, engineering). Home base.
- **Desta Health** — the healthcare/tele-health services line (Training Academy,
  Ethio-TeleHealth). Same team, healthcare-specific surface.
- Mission: healthcare + operations technology that holds up under real-world constraints,
  pairing US healthcare demand with Ethiopian talent. Standard: **clean work, clear delivery,
  systems that don't collapse when reality pushes back.**

## Product portfolio (the ATS is one of six)

| Product | What | Status |
|---------|------|--------|
| **Desta Works ATS** | Recruiting platform for healthcare staffing | **Live, active build** *(this repo)* |
| Training Academy (LMS) | Onboarding/training for care staff; "Work a Shift" sim | Built, preparing for pilot |
| Apto | Practice-planning app for coaches (Next.js PWA on Vercel) | Live MVP — closest to core stack |
| Ethio-TeleHealth | Telehealth triage platform (54-condition protocol library) | Prototype + POC |
| EMR Platform | Clinical records, scheduling, ambient AI notes | Roadmap (longest horizon) |
| Client Web Builds | Practice websites (e.g. Waymakers) | Delivery work |

> Core stack going forward (company-wide): **Next.js, TypeScript, Node, PostgreSQL
> (Supabase), serverless endpoints for AI features on the Claude API.** This is the same
> stack we locked for the ATS rebuild (`docs/STACK-ARCHITECTURE.md`).

## The mandate (today → where we take it)

| Area | Today (built by a non-engineer) | Mandate |
|------|---------------------------------|---------|
| Source & workflow | GitHub, pushed directly, no review | Branches, PRs, readable history |
| App architecture | Apps Script + Sheets (ATS/LMS) | Real backends + DB (PostgreSQL/Supabase) that scale |
| Deploys | Manual, ad hoc | Reliable, repeatable, tested before live |
| Data & secrets | Sheets data; keys handled by hand | Real data layer; secure secrets — **no keys in code** |
| AI features | Not built | Serverless endpoints on the **Claude API** |

## ATS product priorities (the work ahead)

From the Engineering Projects Overview. These are the prioritized feature track for the ATS
(several already exist in rough form in the legacy app and must be made robust/real):

1. **Role-based access** — each team member sees only what their role allows. *(legacy: roles
   exist but are client-trusted — must become server-enforced RBAC.)*
2. **Bulk importer** — migrate thousands of historical records and **auto-match résumés to
   candidate profiles**. *(legacy: a bulk-import/migration view exists; add résumé matching.)*
3. **License verification** against state-board data. *(legacy: per-state board lookup links +
   NPPES exist.)* v1 = **assisted verification queue**; full automation is a fast-follow (`DECISIONS.md` D4).
4. **Smarter sourcing** — "find providers like this" matching + supply-gap analysis. *(legacy:
   NPPES discover + scoring exist; extend to similarity matching + gap analysis.)*

## Legal & compliance constraints (NDA — binding engineering rules)

These are not preferences; they come from the signed Developer NDA and must be honored in code
and process.

- **Confidentiality:** all source, schemas, designs, keys, and client/candidate/patient data
  are Confidential. Don't copy, export, or retain outside approved, Owner-controlled systems.
- **Secrets (NDA §3b):** **never embed secrets in code** or store them in unauthorized places.
  Handle keys per the Owner's instructions. (Owner holds the keys; we build against env vars.)
- **IP / Work Product (NDA §4):** everything built is owned by the Owner; deliver to
  Owner-controlled repos; **retain no copies after termination.**
- **Third-party licenses (NDA §5b):** use **permissive licenses only** (MIT, BSD, Apache 2.0).
  **No copyleft/reciprocal licenses (GPL, LGPL, AGPL)** without the Owner's prior written
  consent. **Maintain a record of third-party components and their licenses** (an SBOM) and
  provide it on request. → enforced as a convention (`docs/CONVENTIONS.md`).
- **AI dev tools (NDA §5c):** allowed, provided they don't transmit Confidential Information or
  source to third parties in a way that compromises confidentiality/ownership; all output is
  Work Product owned by the Owner.
- **Security warranty (NDA §6d):** no malicious code, backdoors, or hidden mechanisms.
- **Data protection (NDA §10):** comply with the **Ethiopian Data Protection Proclamation
  1321/2024** and **US HIPAA where applicable**; access patient/personal data only as needed
  for the Purpose; apply technical safeguards; **report any suspected incident/breach
  promptly.** → drives the security design in `docs/EDD.md` §5.

## How this maps to our plan

- The migration plan (`docs/MIGRATION-PLAN.md`) **is** the mandate's "today → where we take
  it," sequenced. Phase 0 (version-control discipline + close security holes) directly
  satisfies the "Source & workflow" and "Data & secrets" mandates.
- The product priorities above are the **feature track** that runs alongside the
  re-architecture, not instead of it.
- Compliance (HIPAA + Ethiopian proclamation) and "no keys in code" are now **acceptance
  criteria**, not nice-to-haves.

## Decisions

- **Settled:** engineer assigned to the **ATS** (this repo).
- **Decided (engineer's technical call, to share with Biruh):** **Better Auth on Supabase
  Postgres** — Supabase as managed Postgres only; Better Auth for auth/RBAC.

## To raise with Biruh later (holding for now)

- Provisioning of the **Claude API key, two Supabase projects (staging + prod), Vercel,
  Google OAuth, domain/DNS access (`zyx.com` + `staging.zyx.com`), and Apps Script access**
  (Owner holds keys; engineer builds against env secrets). See `DECISIONS.md` D6 for the
  environment/domain setup.
