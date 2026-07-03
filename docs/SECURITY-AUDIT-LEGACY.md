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

### What DOES work (so we build on it, not from scratch)
- `verifySession_` correctly verifies a Google ID token (tokeninfo, `aud`, expiry) — sound design, just unwired (F3).
- `getUserRole_` resolves role **server-side** from `ATS_Profiles` / `ATS_ClientContacts` — role is *not* taken from the client payload. Good.
- The ~23 "strict" leadership / BD endpoints and `portal_*` are gated **when a session exists** — but see F3: the real client can't produce one.

## Remediation (ordered — flipping `ENFORCE_AUTH` alone breaks the app)

1. **Client:** attach the Google `credential` as `idToken` on every `post` / `postJSON` / `fetch(U)` call.
2. **`verifySession_`:** accept `credential` (or rename the client field to `idToken`).
3. **`doGet`:** add the same auth gate — it currently has none (F1).
4. **Roster:** confirm every real operator exists in `ATS_Profiles`.
5. **Enable:** set `ENFORCE_AUTH='true'`; add `ats_purge_candidate` to the leadership allow-list (F5); fix `change_password` (F6); stop storing plaintext passwords (F7).
6. **Rotate:** redeploy to a fresh `/exec` URL (the current one has been open) and update the client.
7. **Verify deployment settings:** confirm "Execute as" and "Who has access" (screenshot of Deploy → Manage deployments still needed).

## Status
- [x] Audited — gap **confirmed and documented** (satisfies 0.9 done-when: "gap documented + escalated").
- [ ] Escalate to Biruh (owner) — this is a live PII exposure; his decision on urgency + disclosure.
- [ ] Land the fix on the live Apps Script (steps 1–7). Engineer writes the patch; **owner applies/deploys** (no automated writes to the live system).

**Open question for the owner:** confirm the current `ENFORCE_AUTH` script property value and the
web-app "Who has access" setting, so we know the exact live exposure window.
