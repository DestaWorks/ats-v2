-- Client Discovery migration regression fix: `prisma migrate dev` diffs the ENTIRE database
-- against the ENTIRE schema.prisma file, not just the models being changed. Because these two
-- pg_trgm indexes are deliberately NOT declared in schema.prisma (see
-- 20260803185528_add_pg_trgm_candidate_search_indexes for why, and the comment above
-- Candidate's @@map), the immediately-preceding migration
-- (20260807102740_add_client_discovery_prospects) proposed and auto-applied DROPping them as
-- "drift" — this is the SAME regression documented in
-- 20260803194500_restore_pg_trgm_candidate_search_indexes, hit again by not following its own
-- "always run --create-only first" instruction. This migration recreates them.

CREATE INDEX IF NOT EXISTS "candidates_name_trgm_idx" ON "candidates" USING GIN ("name" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "candidates_email_trgm_idx" ON "candidates" USING GIN ("email" gin_trgm_ops);
