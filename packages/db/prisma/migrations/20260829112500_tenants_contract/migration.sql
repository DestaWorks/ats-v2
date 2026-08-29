-- Phase 6.2 (SAAS-RESTRUCTURE-PLAN) — contract. Runs only after
-- `20260829112000_tenants_backfill` and after the reconciliation script reports zero orphans.
--
-- WHY THE ORDER MATTERS. `SET NOT NULL` scans the table and ABORTS if one row is still NULL.
-- That is the safety property, not a hazard: a partial backfill fails the migration and leaves
-- the database exactly as it was, rather than silently admitting rows that belong to no tenant.
-- Run scripts/check-tenant-reconciliation.mjs first anyway — it names the offending tables, which
-- a failed ALTER does not.
--
-- WHY THE DROPS ARE SAFE. This migration drops indexes only, never a table, column or row. Each
-- DROP is paired with the CREATE that supersedes it in the same transaction, so no window exists
-- in which the uniqueness rule is unenforced. Every replacement is strictly WEAKER (unique per
-- tenant instead of globally unique), so no data that satisfies the old constraint can violate
-- the new one — the migration cannot fail on existing rows.
--
-- THE UNIQUENESS RE-KEY, AND SIX THE PLAN MISSES. The plan's table lists seven rules. Reading
-- every `@unique` on a tenant-scoped model turns up six more that are just as broken under
-- multi-tenancy, and they are re-keyed here too:
--
--   candidate_notes.legacyId, source_leads.legacyId, open_roles.legacyId
--       Same ETL-idempotency key as the four the plan lists. Left global, the second tenant to
--       import a legacy Sheet collides with the first tenant's row ids.
--   source_leads.npi
--       The plan re-keys prospects.npi but not this one, and this is the worse of the two: an NPI
--       identifies a clinician, not a tenant's relationship with one. Left global, tenant B can
--       never source a lead that tenant A already holds, and the failure looks like a duplicate.
--   daily_briefs.date, weekly_briefs.weekStart
--       One brief per calendar day/week FOR THE WHOLE INSTALLATION. Left global, the second
--       tenant's Monday brief fails to save because the first tenant already saved one.
--
-- Reported back to docs/SAAS-RESTRUCTURE-PLAN.md, which now lists thirteen.
--
-- STILL GLOBAL, DELIBERATELY. `client_portal_tokens.tokenHash` — a token is a credential and
-- must be unique across the whole installation, or a collision would authenticate the wrong
-- contact. `client_rules.clientId` and `client_match_profiles.clientId` — one-to-one with a row
-- that is itself tenant-scoped, so the rule already cannot cross a tenant boundary.
--
-- LEFT ALONE, FLAGGED. `daily_targets/daily_actuals/daily_logs (userId, date)`,
-- `saved_views (userId, scope, name)` and `saved_icps (userId, name)` are per-user, and the plan
-- states they are already safe. They are safe against a cross-tenant READ, but they do mean one
-- human in two tenants shares one row. That is a Phase 6.5 question (tenant switching), not a
-- constraint this migration should answer unilaterally.


-- Every tenant-scoped column becomes required.
ALTER TABLE "access_request" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "activity_log" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "ai_usage_event" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "ai_settings" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "migration_runs" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "clients" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "client_contacts" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "client_portal_tokens" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "portal_access_requests" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "client_tasks" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "client_meetings" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "client_notes" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "deals" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "deal_blockers" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "client_rules" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "candidates" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "documents" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "candidate_notes" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "mentions" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "stage_history" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "screening_scorecards" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "source_leads" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "outreach_attempts" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "daily_targets" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "daily_actuals" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "daily_logs" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "journal_entries" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "journal_goals" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "manager_feedback" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "saved_views" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "open_roles" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "role_notes" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "client_match_profiles" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "daily_briefs" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "weekly_briefs" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "prospects" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "prospect_contacts" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "saved_icps" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "report_exports" ALTER COLUMN "tenantId" SET NOT NULL;

-- Uniqueness, re-keyed per tenant.
DROP INDEX "candidates_legacyId_key";
CREATE UNIQUE INDEX "candidates_tenantId_legacyId_key" ON "candidates"("tenantId", "legacyId");
DROP INDEX "clients_legacyId_key";
CREATE UNIQUE INDEX "clients_tenantId_legacyId_key" ON "clients"("tenantId", "legacyId");
DROP INDEX "documents_legacyId_key";
CREATE UNIQUE INDEX "documents_tenantId_legacyId_key" ON "documents"("tenantId", "legacyId");
DROP INDEX "outreach_attempts_legacyId_key";
CREATE UNIQUE INDEX "outreach_attempts_tenantId_legacyId_key" ON "outreach_attempts"("tenantId", "legacyId");
DROP INDEX "prospects_npi_key";
CREATE UNIQUE INDEX "prospects_tenantId_npi_key" ON "prospects"("tenantId", "npi");
-- The plan's seventh row, added but NOT replacing the global one. `source_leads_promotedCandidateId_key`
-- survives on purpose: Prisma refuses a one-to-one relation whose defining field is unique only
-- inside a composite, and dropping it would demote `Candidate.promotedFromLead` from 0/1 to a
-- list in every consumer's types. Keeping it is free, because the column holds a Candidate cuid —
-- already globally unique — so unlike `legacyId` or `npi` it cannot collide across tenants.
CREATE UNIQUE INDEX "source_leads_tenantId_promotedCandidateId_key" ON "source_leads"("tenantId", "promotedCandidateId");
DROP INDEX "candidate_notes_legacyId_key";
CREATE UNIQUE INDEX "candidate_notes_tenantId_legacyId_key" ON "candidate_notes"("tenantId", "legacyId");
DROP INDEX "source_leads_legacyId_key";
CREATE UNIQUE INDEX "source_leads_tenantId_legacyId_key" ON "source_leads"("tenantId", "legacyId");
DROP INDEX "source_leads_npi_key";
CREATE UNIQUE INDEX "source_leads_tenantId_npi_key" ON "source_leads"("tenantId", "npi");
DROP INDEX "open_roles_legacyId_key";
CREATE UNIQUE INDEX "open_roles_tenantId_legacyId_key" ON "open_roles"("tenantId", "legacyId");
DROP INDEX "daily_briefs_date_key";
CREATE UNIQUE INDEX "daily_briefs_tenantId_date_key" ON "daily_briefs"("tenantId", "date");
DROP INDEX "weekly_briefs_weekStart_key";
CREATE UNIQUE INDEX "weekly_briefs_tenantId_weekStart_key" ON "weekly_briefs"("tenantId", "weekStart");

-- List and keyset indexes, re-led by tenant.
DROP INDEX "candidates_deletedAt_createdAt_id_idx";
CREATE INDEX "candidates_tenantId_deletedAt_createdAt_id_idx" ON "candidates"("tenantId", "deletedAt", "createdAt", "id");
DROP INDEX "candidates_status_deletedAt_createdAt_id_idx";
CREATE INDEX "candidates_tenantId_status_deletedAt_createdAt_id_idx" ON "candidates"("tenantId", "status", "deletedAt", "createdAt", "id");
DROP INDEX "candidates_status_deletedAt_stageEnteredAt_idx";
CREATE INDEX "candidates_tenantId_status_deletedAt_stageEnteredAt_idx" ON "candidates"("tenantId", "status", "deletedAt", "stageEnteredAt");
DROP INDEX "source_leads_deletedAt_createdAt_id_idx";
CREATE INDEX "source_leads_tenantId_deletedAt_createdAt_id_idx" ON "source_leads"("tenantId", "deletedAt", "createdAt", "id");
DROP INDEX "prospects_deletedAt_createdAt_id_idx";
CREATE INDEX "prospects_tenantId_deletedAt_createdAt_id_idx" ON "prospects"("tenantId", "deletedAt", "createdAt", "id");
DROP INDEX "activity_log_at_id_idx";
CREATE INDEX "activity_log_tenantId_at_id_idx" ON "activity_log"("tenantId", "at", "id");
DROP INDEX "activity_log_action_at_id_idx";
CREATE INDEX "activity_log_tenantId_action_at_id_idx" ON "activity_log"("tenantId", "action", "at", "id");

-- The raw-SQL index. Same name on purpose: it is the name `scripts/check-raw-sql-indexes.mjs`
-- replays the migration set for, and keeping it makes this the same index's history rather than a
-- new one beside an old one. Still absent from schema.prisma — Prisma's DSL cannot express a
-- partial index over `lower(email)` — which is exactly why the check exists.
DROP INDEX IF EXISTS "source_leads_email_lower_unique_idx";
CREATE UNIQUE INDEX "source_leads_email_lower_unique_idx"
  ON "source_leads" ("tenantId", lower("email"))
  WHERE "email" IS NOT NULL AND "deletedAt" IS NULL;
