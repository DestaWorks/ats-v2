-- Tenant index tuning (SAAS-RESTRUCTURE-PLAN, Phase 6 follow-up).
--
-- 6.1 gave all 39 tenant-scoped tables a bare `(tenantId)` index. That was the right thing to add
-- blind, and it is the wrong thing to keep: with one dominant tenant — which is exactly what
-- tenant #1 is and will remain for a while — a `tenantId`-only index selects nearly every row, so
-- the planner ignores it for reads while every INSERT and UPDATE still pays to maintain it.
--
-- Two changes, both derived from the repository query shapes rather than from guesswork:
--
--   1. Drop the bare index where a composite already LEADS with `tenantId`. A composite serves
--      `tenantId`-only lookups by leftmost prefix, including the FK check behind
--      `ON DELETE CASCADE`, so the bare one is pure duplicate write cost.
--   2. Add composites on the second column those tables are actually filtered by:
--      `deletedAt` appears in 31 repository where-clauses, `clientId` in 24, `status` in the
--      sourcing and open-role lists.
--
-- CONCURRENTLY is deliberately NOT used: these run inside Prisma's migration transaction, and
-- `CREATE INDEX CONCURRENTLY` cannot. The tables are small enough today that a brief lock is
-- cheaper than the operational complexity of running them outside the migration; revisit that if
-- any of these grows past a few million rows before this is applied.

-- 1. Composites the query shapes justify.
CREATE INDEX IF NOT EXISTS "candidates_tenantId_clientId_idx"      ON "candidates" ("tenantId", "clientId");
CREATE INDEX IF NOT EXISTS "open_roles_tenantId_status_idx"        ON "open_roles" ("tenantId", "status");
CREATE INDEX IF NOT EXISTS "source_leads_tenantId_status_idx"      ON "source_leads" ("tenantId", "status");
CREATE INDEX IF NOT EXISTS "documents_tenantId_deletedAt_idx"      ON "documents" ("tenantId", "deletedAt");
CREATE INDEX IF NOT EXISTS "client_notes_tenantId_deletedAt_idx"   ON "client_notes" ("tenantId", "deletedAt");
CREATE INDEX IF NOT EXISTS "client_tasks_tenantId_deletedAt_idx"   ON "client_tasks" ("tenantId", "deletedAt");

-- 2. Bare `(tenantId)` indexes now covered by a composite's leftmost prefix.
--    Dropped AFTER the composites above exist, so no table is ever left without one.
DROP INDEX IF EXISTS "activity_log_tenantId_idx";
DROP INDEX IF EXISTS "candidates_tenantId_idx";
DROP INDEX IF EXISTS "source_leads_tenantId_idx";
DROP INDEX IF EXISTS "prospects_tenantId_idx";
DROP INDEX IF EXISTS "documents_tenantId_idx";
DROP INDEX IF EXISTS "client_notes_tenantId_idx";
DROP INDEX IF EXISTS "client_tasks_tenantId_idx";
