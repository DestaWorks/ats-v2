-- `prospects.practiceName` gets the same `contains`+`insensitive` search pattern as
-- `candidates.name`/`candidates.email` (see 20260803185528_add_pg_trgm_candidate_search_indexes),
-- which needed a hand-written pg_trgm GIN index because Prisma can't cleanly express one in
-- schema.prisma. Prospects grow via NPPES bulk-add (potentially thousands of rows at once, unlike
-- one-at-a-time Leads), so the same unindexed-ILIKE scan risk applies here from day one — added
-- proactively rather than waiting to hit it in production. Deliberately NOT declared in
-- schema.prisma either, for the same reason and to avoid the same `prisma migrate dev` drift
-- regression documented in 20260807102900_restore_pg_trgm_candidate_search_indexes — hand-write
-- migrations like this one instead of `prisma migrate dev` when touching this table.

CREATE INDEX IF NOT EXISTS "prospects_practicename_trgm_idx" ON "prospects" USING GIN ("practiceName" gin_trgm_ops);
