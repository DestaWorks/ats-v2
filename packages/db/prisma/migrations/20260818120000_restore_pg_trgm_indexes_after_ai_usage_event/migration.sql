-- Same regression documented in 20260807102900_restore_pg_trgm_candidate_search_indexes, hit
-- again by 20260818084207_add_ai_usage_event (ran `prisma migrate dev` instead of
-- `--create-only`, so it auto-applied the proposed DROP of these hand-written, not-in-schema
-- indexes as "drift"). Restores all three.

CREATE INDEX IF NOT EXISTS "candidates_name_trgm_idx" ON "candidates" USING GIN ("name" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "candidates_email_trgm_idx" ON "candidates" USING GIN ("email" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "prospects_practicename_trgm_idx" ON "prospects" USING GIN ("practiceName" gin_trgm_ops);
