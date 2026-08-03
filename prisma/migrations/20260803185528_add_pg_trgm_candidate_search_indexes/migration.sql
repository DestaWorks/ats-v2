-- Perf audit 2026-08-03: candidate.repository.ts's search does `name`/`email` `contains`
-- (case-insensitive) — a plain btree can only accelerate PREFIX matches, never substring search,
-- so every keystroke was a sequential scan of the whole `candidates` table. pg_trgm GIN indexes
-- accelerate `contains`/ILIKE '%term%' directly.
--
-- Hand-written (not declared in schema.prisma): this Supabase-managed DB already has extensions
-- Prisma never tracked (pgcrypto, uuid-ossp, pg_stat_statements, supabase_vault). Turning on the
-- `postgresqlExtensions` preview feature to declare pg_trgm there makes Prisma try to reconcile
-- ALL of them against migration history, which it can only do via a full schema reset — not worth
-- that risk for one extension.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- CreateIndex
CREATE INDEX "candidates_name_trgm_idx" ON "candidates" USING GIN ("name" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "candidates_email_trgm_idx" ON "candidates" USING GIN ("email" gin_trgm_ops);
