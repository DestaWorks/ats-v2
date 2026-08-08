-- Concurrency fix: leadService.importLeads() pre-checks for an existing lead by lowercased email
-- before inserting, but that check-then-insert has no DB-level backstop — two concurrent imports
-- (or an import racing a manual add) targeting the same email could both pass the pre-check and
-- both insert, producing a real duplicate lead. There was no unique constraint on email at all.
--
-- A partial, case-insensitive unique index (not a plain @unique on `email`, which Prisma's schema
-- DSL can't express as case-insensitive/functional) so:
--   - live leads (deletedAt IS NULL) can never share an email, case-insensitively
--   - a soft-deleted lead's email is NOT reserved forever — matches this app's reversible-trash
--     philosophy (a fresh lead can reuse an email that only a trashed lead was using)
--   - NULL emails are unconditionally allowed to repeat (Postgres treats NULLs as distinct in a
--     unique index anyway, but the explicit WHERE also keeps the index small — most rows are
--     from CSV imports without a clean email)
--
-- One pre-existing live duplicate ("abebe@gmail.com", two rows) was found and resolved (the
-- newer, less-complete row soft-deleted) before this migration was written — see the
-- `source_lead` "delete" activity_log entry for that lead's id, actor Owner, 2026-08-08.
--
-- Deliberately NOT declared in schema.prisma (same reason as the pg_trgm indexes — Prisma can't
-- express a functional/partial unique index in its DSL) — hand-write migrations like this one
-- instead of `prisma migrate dev` when touching `source_leads`, or `migrate dev`'s whole-schema
-- diff will propose DROPping it as drift (the exact regression already hit twice for the trgm
-- indexes, documented in 20260807102900_restore_pg_trgm_candidate_search_indexes).

CREATE UNIQUE INDEX IF NOT EXISTS "source_leads_email_lower_unique_idx"
  ON "source_leads" (lower("email"))
  WHERE "email" IS NOT NULL AND "deletedAt" IS NULL;
