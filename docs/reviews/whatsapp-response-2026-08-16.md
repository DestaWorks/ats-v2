Thanks, went through the review against the current code.

**Already implemented:**
- Password reset (H3 is outdated — this is live, not a manual DB edit)
- Persistent rate limiting (Upstash Redis)
- DB connection pool tuning
- ClientRules re-fetch fix (§2.2)
- Encryption key generated and set in production

Pull the latest branch to see these.

**I will look into these next:**
- F1 — bulk lead-status action orphans a "Promoted" lead
- F2 — CSV export formula injection
- F3 — portal-approval race condition
- F4 — role-note IDOR
- F5–F10 — résumé/ETL idempotency, recap undercount, mention markRead bug, stuck-badge mismatch
- H2 remainder — will look into expanding encryption coverage (email/phone/NPI/notes)

**Deferred to go-live:**
- H4 — current environment is staging, not production yet; will set a fresh owner credential when we move to production.

H8 (no per-record ownership check) isn't actually open — it's a documented, deliberate trade-off in `DECISIONS.md` D3 for a small team, already accepted. Not something pending.
