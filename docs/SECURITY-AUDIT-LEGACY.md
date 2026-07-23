# Legacy App Security Audit (Wave 0.9)

**Date:** 2026-07-03 · **Auditor:** Leliso (engineer) · **Source:** live Apps Script backend
(`legacy/Code.gs`, gitignored) + `index.html` client.

**Scope:** Does the live DestaHealth ATS backend authenticate/authorize requests server-side,
or does it trust the client? **Conclusion: the backend is effectively open — unauthenticated
read/write of real candidate PII/PHI is possible by anyone with the web-app URL.**

> No live endpoint was called during this audit (it would return real PII). Findings are from
> source review only. The web-app URL, Google client ID, and admin emails live in the
> gitignored `legacy/Code.gs` and are **not** reproduced here.

## Severity: CRITICAL

A live system holding PHI/PII of medical professionals (names, emails, phones, license #s) is
reachable by anyone possessing a URL that is **visible in the public page source** of the
GitHub-Pages-hosted client. Compliance exposure: HIPAA (where applicable) + Ethiopian Data
Protection Proclamation 1321/2024.

## Findings

| # | Finding | Evidence | Impact |
|---|---------|----------|--------|
| F1 | **`doGet` returns entire sheets with NO auth** (providers, credentials, enrollments). | `Code.gs` ~L2688+; client `index.html:780` `fetch(U)` GET. | Unauthenticated GET → full candidate PII + credential dump. |
| F2 | **Web-app URL is public** — hardcoded in the client served from `github.io`. | `index.html:79` (`var U=".../exec"`). | Anyone who views source has the endpoint. |
| F3 | **Auth gate is dead — client sends no token.** `verifySession_` reads `data.idToken`; client stores Google login as `credential` and its POST wrapper attaches neither. | `Code.gs:28-45`; `index.html:81-82` (`post`/`postJSON`), token field `credential`. | `_verifiedSession` never set → gate is a no-op for the real client. |
| F4 | **`ENFORCE_AUTH` defaults OFF.** "Require verified operator for everything else" only runs if the `ENFORCE_AUTH` script property === `'true'`. App functions → it is off. | `Code.gs:130,162-167`. | ~70 of 94 `event` operations callable unauthenticated. |
| F5 | **Hard-delete not gated.** `ats_purge_candidate` (irreversible) is absent from the leadership allow-list; only soft-delete (`ats_delete_candidate`) is listed. | `Code.gs:150` list vs `Code.gs:556` handler. | Permanent candidate deletion by anyone (soft mode). |
| F6 | **`change_password` privilege bypass** — trusts client-supplied `data.admin === true` to skip the current-password check. | `Code.gs:316`. | Anyone can reset any user's password. |
| F7 | **Plaintext passwords** stored in the `Invites` sheet. | `Code.gs:187-189`. | Credential compromise if sheet is exposed. |
| F8 | **Hardcoded backdoor login in shipped client JS.** `ADMINS=["biruhmezgebu1@gmail.com","biruh","b"]`; signing in with email `"b"` and password `"desta"` grants full Owner/Admin access — no server round trip at all. | `index.html:118` (`ADMINS`), `index.html:801` (`trySignIn`: `ADMINS.indexOf(em)>=0 && pw==="desta"`). | A literal hardcoded credential, readable by anyone who views page source on the public github.io client — not "unwired auth" like F3/F4, an intentional-looking bypass that doesn't need the backend to be broken at all. |
| F9 | **`doGet` leaks the ENTIRE `Invites` sheet — including everyone's plaintext password — to any unauthenticated GET.** A specific, worse instance of F1: this isn't just a PII/credential-adjacent dump, it's literally every user's login password, polled by every client every 30s. | `Code.gs:2727-2743` (`doGet` returns `result.invites`); `Invites` sheet columns `Email,Name,Platform,Password,Added At` (`Code.gs:187`). | Anyone with the web-app URL can log in as ANY user, not just read PII — full account takeover for the whole team, not just data exposure. |
| F10 | **Privilege escalation via `ats_update_profile`** — sets `data.role` on any email's `ATS_Profiles` row with no "is this me" scoping and no admin gate (not in `STRICT_LEADERSHIP_ENDPOINTS`/`STRICT_LEADERSHIP_OR_BD`). `ATS_Profiles.Role` is the field `getUserRole_()` actually reads to enforce the leadership allow-list. | `Code.gs:2047-2069` (handler); `Code.gs:58-78` (`getUserRole_` reads `ATS_Profiles.Role`). | Any authenticated (or, per F3/F4, effectively any) caller can self-promote to `owner` and unlock every leadership-gated endpoint. |
| F11 | **RBAC in the Admin Panel is disconnected from what the server enforces — "assigning a role" in the UI does nothing real.** The Admin Panel's `assignRole()` only appends an `ats_log` activity row; the UI *displays* role by replaying that log client-side. Server-side authorization reads a completely different field (`ATS_Profiles.Role`, F10) that only self-service profile edits touch. | `index.html:9030` (`assignRole`, writes `action:"assign_role"` to the activity log only); `index.html:830` (client replays the log into `USER_ROLES` for display); `Code.gs:58-78` (`getUserRole_` reads `ATS_Profiles.Role` instead). | An admin demoting someone in the Admin Panel has no server-side effect — the demoted user keeps whatever privilege `ATS_Profiles.Role` still says. Two sources of truth for "what role does this person have," and only one of them is real. |

### What DOES work (so we build on it, not from scratch)
- `verifySession_` correctly verifies a Google ID token (tokeninfo, `aud`, expiry) — sound design, just unwired (F3).
- `getUserRole_` resolves role **server-side** from `ATS_Profiles` / `ATS_ClientContacts` — role is *not* taken from the client payload. Good.
- The ~23 "strict" leadership / BD endpoints and `portal_*` are gated **when a session exists** — but see F3: the real client can't produce one.

## Remediation (ordered — flipping `ENFORCE_AUTH` alone breaks the app)

0. **Fastest, highest-value fix, do this FIRST and independently of everything else below:**
   delete the `ADMINS`/`pw==="desta"` backdoor block from `index.html` (F8) and rotate every real
   password in the `Invites` sheet (F7/F9 mean they're all effectively already public). Neither
   needs `ENFORCE_AUTH` or any other step below — it's a client-file edit + a credential rotation,
   shippable same-day.
1. **Client:** attach the Google `credential` as `idToken` on every `post` / `postJSON` / `fetch(U)` call.
2. **`verifySession_`:** accept `credential` (or rename the client field to `idToken`).
3. **`doGet`:** add the same auth gate — it currently has none (F1), and is what makes F9 (plaintext
   password leak) possible; **stop returning the `Password` column from `doGet` entirely**, gated or not.
4. **Roster:** confirm every real operator exists in `ATS_Profiles`.
5. **Enable:** set `ENFORCE_AUTH='true'`; add `ats_purge_candidate` to the leadership allow-list (F5);
   fix `change_password` (F6); stop storing plaintext passwords (F7); gate `ats_update_profile` so
   only an admin (or the caller themself, and never for the `role` field) can write it (F10); rewire
   `assignRole()` to actually write `ATS_Profiles.Role` instead of just logging an activity row (F11).
6. **Rotate:** redeploy to a fresh `/exec` URL (the current one has been open) and update the client.
7. **Verify deployment settings:** confirm "Execute as" and "Who has access" (screenshot of Deploy → Manage deployments still needed).

## Status
- [x] Audited — gap **confirmed and documented** (satisfies 0.9 done-when: "gap documented + escalated").
- [x] Audited further (2026-07-23, during Wave 5.3 Admin-module research) — found the hardcoded
  admin backdoor (F8), confirmed `doGet` leaks plaintext passwords not just PII (F9), found a role
  self-escalation path (F10), and found the Admin Panel's role-assignment UI doesn't actually
  change server-enforced access at all (F11). **These make the live exposure worse than
  originally scoped** — F8/F9 together mean anyone who's viewed the page source already has a
  working admin login, independent of whether `ENFORCE_AUTH` is on or off.
- [ ] Escalate to Biruh (owner) — this is a live PII exposure AND a live credential/account-takeover
  exposure (F8/F9); his decision on urgency + disclosure. Given F8 requires zero technical
  exploitation (it's a literal password anyone can read in page source), recommend treating step 0
  above as "today," independent of the rest of this list's timeline.
- [ ] Land the fix on the live Apps Script (steps 0–7). Engineer writes the patch; **owner applies/deploys** (no automated writes to the live system).

**Open question for the owner:** confirm the current `ENFORCE_AUTH` script property value and the
web-app "Who has access" setting, so we know the exact live exposure window. Also: given F8/F9,
worth confirming whether the `b`/`desta` login or any of the leaked `Invites` passwords show any
sign of having been used by someone outside the team.
