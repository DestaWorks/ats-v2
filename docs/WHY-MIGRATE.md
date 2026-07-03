# DestaHealth ATS — State of the Product & the Case for Rebuilding

**Prepared for:** Biruh Mezgebu (Owner)
**From:** Leliso Agegnehu (Engineering)
**Re:** An honest read of where the ATS stands, what happens if we leave it as-is, and why the
rebuild is the right next move.

> **Note:** this is the **internal, detailed** case (the full risk/decay analysis). The polished
> **send-to-client** version — combining this *plus* the delivery plan — is
> **`CLIENT-BRIEF.md`**. Send that one; keep this one as the reasoning behind it.

> This is written plainly and honestly — clarity over polish. It assumes no technical background.
> Where it points out weaknesses, they're about the *technical foundation the app was built on*,
> not the product itself. The product is proven and valuable — which is exactly why it's worth
> investing in a foundation that can carry it further.

---

## The short version (read this if nothing else)

The ATS **works, and it's genuinely capable.** It runs the business today — a complete recruiting
operation the team relies on daily.

But it was built as a **fast prototype**, and it's now doing a **production job**. It runs fine
right now for one reason only: **the data is still small and the users are few.** The trouble is
that the exact things that made it quick to build are the exact things that will **cap its
growth, expose its data, and slow every future change** — and those problems don't arrive
gradually. They stay invisible, then hit all at once, usually **right when the business is
succeeding** (a big client, more recruiters, more candidates).

The rebuild isn't about making the code "prettier." It's about **turning a fragile prototype
into a real business asset** — one that's secure, can grow, can be improved quickly, can be
defended to a regulator, and could one day be sold or invested in. And we do it **gradually,
with the current app staying live the whole time** — no downtime, no big-bang switch.

---

## What the product does today

The ATS is a complete recruiting platform: candidate sourcing, an outreach workflow, a hiring
pipeline, candidate screening and license verification, a full client CRM with health and churn
tracking, AI-written daily and weekly briefs, and nine kinds of reports. It's in daily use and
actively runs the recruiting operation.

That's a strong, proven foundation of *product* — a real working system delivering real value.
It's the launchpad everything else builds on.

## Where it stands today (your own words, exactly right)

In your onboarding notes you said it best: *"what I — not an engineer — put together to get the
business moving. It works, but it's a starting line, not a standard."* That's the honest picture.

Under the hood, the whole app is **one very large file** that the browser has to re-assemble every
time someone opens it, storing all its information in a **Google Sheet acting as a database**, with
**the login and permissions decided inside the user's own browser.** These were smart shortcuts to
get moving fast. They are not shortcuts that survive growth.

---

## What happens if we keep it as-is — area by area

Think of these as latent faults. Most cause no pain today. Each one has a **trigger** — the event
that sets it off — and for almost all of them, the trigger is **growth.**

### 1. Security & protecting people's data — *the most serious*
Right now, **who you are and what you're allowed to do is decided by the user's own browser**, not
by a secure server. In practice that means a technically-minded person could make themselves an
"admin" and see everything. And because the app's private address is visible in the browser, if
the storage behind it isn't independently locking every request, **the personal details of the
medical professionals in your system could be reachable by anyone who finds that address.**

This is real people's names, license numbers, and contact details — the kind of information covered
by US healthcare privacy rules (HIPAA) and Ethiopia's Data Protection Proclamation (1321/2024). A
leak here isn't an embarrassment; it's a **legal and financial liability, and it breaks the trust
of the clients who are your revenue.** And because there's no trustworthy record of who accessed
what, you couldn't even prove the scope afterward.
**Trigger: none — this is a risk today.**

### 2. Growing (more recruiters, clients, candidates)
A Google Sheet isn't built to be a database. It has no fast way to look things up — every action
reads through the data. It slows down noticeably once there are **tens of thousands of records**,
and the app's history log **grows forever** (every action ever taken is stored and re-read). On top
of that, Google strictly limits **how many people can use the script at the same time** (only a
few dozen) and **how long each action can run.** With one recruiter, invisible. With **a team of
5–10 hitting it during a client pilot**, requests start queuing, timing out, and failing.
**Trigger: more data and more simultaneous users — i.e. success.**

### 3. Speed
Because the app is rebuilt in the browser on every visit and **re-calculates everything from
scratch on every screen**, it will get slower as the data grows. Today a page loads fine. As the
history log swells, the heaviest screens (reports, weekly brief, CRM) go from "fine" to
**multi-second freezes** — and it only gets worse over time, because the history never shrinks.
**Trigger: time and data volume.**

### 4. Changing and improving it
Everything lives in **one giant file with no safety net** — no automated tests, no version history
to undo a mistake, no way to review a change before it goes live. So every improvement means
**editing the whole thing and hoping nothing else breaks.** The more features get added this way,
the riskier and slower each new change becomes. Practically, **the speed at which we can add what
clients ask for keeps dropping** — exactly when you need it to rise. And the knowledge of how it
all works sits in **one or two people's heads**; if either steps away, it's a black box.
**Trigger: every change you want to make.**

### 5. Reliability & not losing data
It's **one Sheet, one script, one Google account** — a single point of failure with no guaranteed
backups and no clean way to restore. Saves are "fire and forget" — the app assumes they worked. A
bad import, an accidental delete, or a lost Google permission could **corrupt or wipe the
operational memory of the business**, quietly and without a clean recovery path.
**Trigger: one bad operation or account issue.**

### 6. Winning bigger clients (compliance)
Larger and healthcare-adjacent clients increasingly ask, *"how do you protect our data?"* In its
current state, the app **cannot pass that kind of security review.** So compliance isn't just a
legal box — it's a **revenue gate**: the most valuable clients are the ones you either can't sign
or would be exposed by signing.

### 7. The quieter costs
- **Locked to Google's limits** you don't control.
- **No early warning system** — when something breaks, you hear it from an upset recruiter, not a
  monitor.
- **Not sellable or investable** — no serious buyer or investor would clear a spreadsheet-backed
  prototype in due diligence. It caps the company's future options.

---

## How this plays out over time (the slow-then-sudden pattern)

- **Months 1–3:** Mostly fine. Slightly slower each week. The occasional change breaks something
  unrelated and costs a day.
- **Months 3–6:** Google's limits start biting — slow saves, timeouts, "try again." Pages take
  longer to open. Recruiters begin to complain. Time goes to babysitting instead of building.
- **Months 6–12:** A real load moment (a client pilot, several recruiters at once) pushes past
  Google's ceilings and it **chokes at the worst possible time.** New features become scary; the
  pace of improvement grinds down.
- **Beyond:** It doesn't dramatically "crash" — it becomes **impossible to improve fast enough and
  impossible to fully trust**, while a single mistake on the one Sheet could take out the core of
  the business.

## The worst cases (the ones worth losing sleep over)
1. **A quiet data leak** of medical professionals' private information — legal exposure, and dead
   client trust.
2. **A single-point wipe** — one bad action erases the operational memory of the business with no
   clean restore.
3. **A failure under load** — the app buckles in front of the very client you were trying to win.

---

## The core reason, in one line

> The rebuild is needed because **the things that made the app fast to build are now the things
> capping its growth, exposing its data, and slowing every change — and they all fail together the
> moment the business grows.** Left alone, the cost and risk only rise the longer we wait.

---

## The good news — the path forward

None of this requires stopping the business or a risky "switch it all off one weekend" moment. The
plan (see the delivery plan) is deliberately **gradual and low-risk**:

- The current app **keeps running the whole time.**
- We build the new, proper version **alongside it** — on a real database, with security enforced on
  the server, and the ability to test changes safely before they go live.
- We move the product across **one piece at a time**, starting with the most valuable (secure
  login, then the hiring pipeline), so there's **no downtime and no big-bang cutover.**
- The most urgent, cheap first step is **closing the security gaps and establishing safe ways to
  make changes** — protecting what exists before building the rest.

---

## Before and after — what the rebuild actually buys you

| | Today (prototype) | After (business asset) |
|---|---|---|
| **Data storage** | Google Sheet, no real backup | Proper database, backed up & encrypted |
| **Login & permissions** | Decided in the browser (bypassable) | Enforced on a secure server, by role |
| **Making changes** | Edit the whole file and hope | Small, reviewed, tested, reversible changes |
| **Growth** | Slower & riskier as you succeed | Scales with users, clients, and data |
| **If a key person leaves** | Black box (1–2 heads) | Any engineer can pick it up |
| **Bigger/healthcare clients** | Can't pass a security review | Defensible and sign-able |
| **Sellable / investable** | No | Yes — survives due diligence |

---

## Bottom line

The current app got the business off the ground — that was its job, and it did it. But it's a
**starting line, not a foundation to scale on.** The rebuild isn't a cost or a rewrite for its own
sake; it's **paying down a debt that's quietly accruing interest every day it stays** — and
converting a fragile prototype into an asset the company can grow on, defend, and one day sell.

The sooner we start, the smaller that debt is.
