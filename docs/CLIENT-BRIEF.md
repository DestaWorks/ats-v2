# DestaHealth ATS — Rebuild Brief

**For:** Biruh Mezgebu (Owner)
**From:** Leliso Agegnehu (Full-Stack Engineer)
**Date:** 2026-07-01

> A plain-language overview of where the app stands today, why it needs rebuilding, and how I'll
> deliver it — with the risks named honestly. **This is the document to send.** (The deeper
> internal risk analysis behind it is `WHY-MIGRATE.md`.)

---

## 1. The short version

The ATS **works and runs the business today** — it's a genuinely capable product. But it was
built fast, as a starting point, and it's now doing a serious job on a foundation that wasn't
made to carry it. It runs fine right now only because **the data is still small and the users are
few.**

The problem: the shortcuts that made it quick to build are the same things that will **expose our
data, slow us down, and eventually break — usually right when the business is winning** (a big
client, more recruiters, more candidates).

The fix isn't cosmetic. I'll **rebuild it on a proper foundation — gradually, with the current
app staying live the whole time — and deliver the full product on a clear, committed timeline.**
No downtime, no big-bang switch. This document explains the why and the plan.

---

## 2. What we have today

Credit where it's due: the ATS is a **complete recruiting platform** — sourcing, the outreach
chase, the hiring pipeline, candidate screening and license checks, a full client CRM with
health and churn tracking, AI-written daily and weekly briefs, and nine kinds of reports. Real
people use it every day. That's a strong, proven product.

You said it yourself in your onboarding notes: *"it works, but it's a starting line, not a
standard."* That's exactly right, and it's the whole reason this next step matters.

**Under the hood** (in plain terms): the entire app is **one big file the browser rebuilds every
time someone opens it**, it stores all its information in a **Google Sheet acting as a database**,
and **the login and permissions are decided inside the user's own browser** instead of on a secure
server. Smart shortcuts to move fast — not shortcuts that survive growth.

---

## 3. The problems — in plain language

Most of these cause no pain *today*. Each one has a **trigger** — the thing that sets it off — and
for almost all of them, the trigger is **growth.** They don't arrive slowly; they stay invisible,
then hit all at once.

### 🔒 Security — the most serious, and it's a risk *right now*
Because login and permissions are decided in the user's browser, a technically-minded person
could make themselves an "admin" and see everything. And the app's private address is visible in
the code — so if the storage behind it isn't independently locking every request, **the personal
details of the medical professionals in our system could be reachable by anyone who finds that
address.** That's names, license numbers, and contacts — the kind of data covered by US health
privacy law (HIPAA) and Ethiopia's Data Protection Proclamation (1321/2024). A leak here isn't
embarrassment; it's **legal liability and lost client trust** — and we couldn't even prove what
was accessed afterward.

### 📈 Growth — it fails precisely when we succeed
A Google Sheet isn't built to be a database. It slows noticeably once there are **tens of
thousands of records**, and our history keeps growing forever. On top of that, Google strictly
limits **how many people can use it at the same time** (only a few dozen). One recruiter: fine. A
**team of 5–10 during a client pilot**: it starts queuing, timing out, and failing.

### 🐢 Speed — it gets slower over time, then cliffs
The app rebuilds itself in the browser on every visit and re-calculates everything from scratch on
every screen. Today, fine. As the data grows, the heaviest screens go from "fine" to
**multi-second freezes** — and it only gets worse, because the history never shrinks.

### 🔧 Changing it — every improvement is risky
Everything lives in **one giant file with no safety net** — no automated tests, no version history
to undo a mistake. So every change means editing the whole thing and hoping nothing else breaks.
The more we add this way, the slower and riskier each new change becomes — **exactly when we need
to move faster to win clients.** And the knowledge lives in very few heads.

### 💾 Reliability — one wrong move can wipe it
It's **one Sheet, one script, one account** — a single point of failure with no guaranteed backup
and no clean way to restore. A bad import or an accidental delete could **corrupt or wipe the
operational memory of the business**, quietly.

### 📋 Compliance — it blocks the biggest clients
Larger and healthcare clients ask, *"how do you protect our data?"* In its current state, the app
**can't pass that kind of review.** So this isn't just legal — it's a **revenue gate**: the most
valuable clients are the ones we either can't sign, or would be exposed by signing.

---

## 4. What happens if we leave it as-is

It doesn't crash on day one — it rots quietly:

- **Months 1–3:** Mostly fine. Slightly slower each week. The odd change breaks something and
  costs a day.
- **Months 3–6:** Google's limits start biting — slow saves, timeouts. Pages take longer to load.
  Recruiters complain. Time goes to babysitting instead of building.
- **Months 6–12:** A real load moment (a client pilot, several recruiters at once) pushes past
  Google's ceilings and it **chokes at the worst possible time.** New features become scary.

**The three worst cases:** a **quiet data leak** of medical professionals' private info; a
**single wrong action wiping the data** with no clean restore; or the app **buckling under load in
front of the client we were trying to win.**

**The core reason, in one line:** *the things that made the app fast to build are now the things
capping its growth, exposing its data, and slowing every change — and they all fail together the
moment the business grows.*

---

## 5. The plan — rebuild it properly, with no downtime

I'll move the app onto a real, professional foundation — **the same stack you already named as the
direction** (Next.js, a real database on Supabase, proper login, AI features on the Claude API).
The approach is deliberately low-risk:

- The **current app keeps running** the entire time.
- I build the new version **alongside it**, on a real database, with security enforced on a secure
  server, and the ability to test changes safely before they go live.
- I move the product across **one piece at a time**, starting with the most valuable (secure login
  and the hiring pipeline) — **no downtime, no big-bang switch.**
- The **UI stays the same** — we reuse the current look and layout (minor cleanups only), so it
  feels familiar to the team from day one.

In short, this delivers **exactly the direction you set out**: real version control, a real
backend and database, reliable and tested deploys, secure secrets with no keys in code, and AI
features on the Claude API.

### The tools I'll build with

These are the modern, industry-standard tools I'll use — the same direction you named, made
concrete. In plain terms:

| Tool | What it's for |
|---|---|
| **Next.js + TypeScript** | The app itself — a modern, widely-used framework for fast, reliable web apps |
| **PostgreSQL (on Supabase)** | The real database — replaces the Google Sheet; backed up and secure |
| **Better Auth** | Secure login and roles — enforced on the server, not the browser |
| **Tailwind CSS** | Styling — lets us reuse the current look and layout as-is |
| **Claude API (Anthropic)** | The AI features — daily/weekly briefs, résumé parsing, and matching |
| **Vercel** | Hosting and reliable, repeatable deploys |
| *Prisma · Zod* | Supporting tools that keep the data safe and correct |

Everything here is a proven, mainstream choice — nothing exotic — so the app stays easy to
maintain and easy for any future engineer to pick up.

### What the rebuild buys us

| | Today (prototype) | After (business asset) |
|---|---|---|
| **Data** | Google Sheet, no real backup | Real database, backed up & encrypted |
| **Login & permissions** | Decided in the browser (bypassable) | Enforced on a secure server, by role |
| **Making changes** | Edit the whole file and hope | Small, tested, reversible changes |
| **Growth** | Slower & riskier as we succeed | Scales with users, clients, and data |
| **If a key person leaves** | A black box | Any engineer can pick it up |
| **Bigger/health clients** | Can't pass a security review | Defensible and sign-able |
| **Sellable / investable** | No | Yes — survives due diligence |

---

## 6. The timeline

Working full-time (5 days/week), I'll deliver the entire product — every part of it — in **7 waves**.
This is realistic because the UI is reused (not redesigned), the new login system comes with roles
built-in, and I'm building AI-assisted.

| Wave | What | When |
|:---:|---|:---:|
| 0 | Foundation + **secure login & roles built properly for the new app** | Month 1 |
| 1 | Move all existing data into the new database + resume parsing | Month 1 |
| 2 | The hiring pipeline + candidate profiles + sourcing (the funnel moves over together) | Month 1–2 |
| 3 | Provider search, screening, license verification queue, open roles, smarter sourcing | Month 2 |
| 4 | Templates + the full CRM (incl. churn/deal analytics) + client portal | Month 2–3 |
| 5 | Daily/weekly briefs, the daily accountability loop, reports, admin, dashboards | Month 3 |
| 6 | Final testing, hardening, and **retiring the old system** | Month 3 |

> **A word on security timing — so I don't over-promise.** The new app's proper, server-enforced
> login is built in Wave 0, but the **live app you use today stays exposed until we cut over to
> the new one.** So I do **two things, not one**: (1) **immediately** audit the current backend
> and, if it's trusting the browser, patch it now with a server-side check — a stop-gap on the
> *live* app that doesn't wait for the rebuild; and (2) build login and roles the right way in the
> new app. That way the security promise is honest: we reduce the risk on the live app **now**,
> and remove it properly at cutover.

**What you can see at each stage:**
- **End of Month 1:** a secure login, all our data safely in the new database, and a working
  pipeline — the old pipeline can be retired.
- **End of Month 2:** the whole recruiting funnel plus client management.
- **End of Month 3:** everything live, the old Google-Sheet system shut down.

**Roles in the new system:** Owner, Director, Manager, Screener, Associate, and Admin — with each
person seeing only what their role allows, enforced securely on the server (not the browser).

**Your ATS priorities are built into the plan** — the four things you flagged for the ATS are all
here:
- **Role-based access** — each person sees only what their role allows.
- **The bulk importer** — brings in our historical records and matches résumés to candidate
  profiles (with a confidence check, so a low-confidence match is flagged for a human rather than
  guessed).
- **Assisted license verification** — a verification queue that lists who needs checking, gives
  **one-click links to the right state boards**, records the result, and **tracks expiry dates** so
  nothing lapses. This is assisted, not fully automatic, in the first version. **Fully automated,
  hands-off state-board checks are a fast-follow** after launch — I'd rather ship the reliable
  assisted version first than promise a fragile automation on day one.
- **Smarter sourcing** — two separate things, kept honest: (a) **"find providers like this one"** —
  point at a good candidate and surface similar providers we don't have yet (this is genuinely
  new); and (b) **matching our existing candidates to an open role** and spotting coverage gaps.
  They're related but not the same, so I'm not overstating either.

---

## 7. What I need from you to hit the date

This is a tight, full plan with no slack. Three things keep it on track:

1. **Unblock me in week 1.** **You hold the keys — I build against them** (just as you set it up).
   I never need to hold the keys myself; I just need them provisioned: Claude API, Supabase,
   hosting, and Google login, plus access to the current backend and an export of our current
   data. **Important — the clock starts when these are in my hands, not when you say "go."** The
   timeline is counted from that day (call it day zero: keys provisioned, backend access granted,
   data exported). Every day between your "yes" and that day simply shifts the finish date by the
   same amount — it doesn't cost extra, but it doesn't come for free either.
2. **Hold the scope.** New feature ideas are welcome — they go on a "version 2" list, not into
   these 3 months. Adding mid-flight is the one thing that breaks the date.
3. **Trust the sequence.** I build the most valuable and most dangerous parts first (security,
   data, pipeline), so even in a worst case, the core is always protected.

**How we'll work:** low ceremony, high clarity. I'll send a short written progress update each
week and show you each wave as it lands, so you always know where things stand — and if I hit a
blocker, you'll hear it early and specifically.

---

## 8. The honest part

"Done in 3 months" means **fully working** — then we keep hardening and polishing after. Three
parts carry the real risk because they're about *correctness*, not looks: **moving the data safely
without loss, the CRM's analytics, and the reports.** If anything runs long, the **flex items slip
first — the deeper CRM analytics and the heaviest report types (finished as a short follow-on right
after) — never the core, the recruiting funnel, or the daily driver your team uses every day.**

So the commitment is honest and safe: **the full product in 3 months, with the security fix and
the daily-driver locked in first, and a clear fallback that never touches what matters most.**

---

## Bottom line

The current app got the business off the ground — that was its job, and it did it well. But it's a
**starting line, not a foundation to grow on.** The rebuild turns a fragile prototype into a real
asset the company can **scale on, defend to a regulator, and one day sell** — and I can deliver it
in **3 months, with no downtime.**

The sooner we start, the smaller the risk we're carrying. I'm ready to begin as soon as I'm
unblocked.
