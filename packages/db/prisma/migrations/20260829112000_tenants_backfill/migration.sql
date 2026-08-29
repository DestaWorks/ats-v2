-- Phase 6.2 (SAAS-RESTRUCTURE-PLAN) — backfill. Purely additive: it writes only columns that
-- `20260829111500_tenants_expand` created and are still NULL, and inserts rows into two tables
-- that migration created empty. No existing value is overwritten and nothing is dropped, so it is
-- safe to run against the live database while the app serves, and safe to re-run.
--
-- The operator's own tenant gets a FIXED, readable id rather than a generated cuid. Three things
-- need to name it and none of them can look it up: this file, the reconciliation script
-- (scripts/check-tenant-reconciliation.mjs) and the Phase 7 Sheet ETL, which the plan says is
-- "two files deep, trivially redirected" — that redirection is only trivial if the id is a
-- constant. A cuid would make each of those a query against a row that may not exist yet.
--
-- `plan` is 'internal', not the column's 'trial' default: tenant #1 is the agency that owns the
-- installation, not a customer on a price plan, and letting it default to 'trial' would put a
-- trial expiry in front of the only tenant that exists.

-- Tenant #1 — the current operator. ON CONFLICT so a re-run is a no-op rather than an error.
INSERT INTO "tenants" ("id", "slug", "name", "status", "plan", "createdAt", "updatedAt")
VALUES ('tnt_destaworks', 'destaworks', 'Desta Works', 'active', 'internal', now(), now())
ON CONFLICT ("id") DO NOTHING;

-- One membership per existing user, carrying that user's current `user.role` verbatim.
--
-- The role is COPIED, not translated: whatever governs access today keeps governing it, so this
-- migration cannot change anyone's permissions. `user.role` stays in place for now — it is Better
-- Auth's admin-plugin column (adminRoles / defaultRole / setRole) and is cached in the session
-- cookie, so removing it is an auth change, not a schema change. See the note in Phase 6.2.
--
-- The membership id is derived from the user id so the mapping is reproducible and greppable, and
-- so a re-run collides on the primary key instead of inserting a second membership.
INSERT INTO "memberships" ("id", "tenantId", "userId", "role", "status", "createdAt")
SELECT 'mbr_' || "u"."id", 'tnt_destaworks', "u"."id", "u"."role", 'active', now()
FROM "user" AS "u"
ON CONFLICT ("tenantId", "userId") DO NOTHING;

-- Every existing row in the 39 tenant-scoped tables belongs to tenant #1: this installation has
-- only ever served one agency. `WHERE "tenantId" IS NULL` keeps the statement idempotent and
-- means a re-run after a second tenant exists cannot re-home that tenant's rows.

UPDATE "access_request" SET "tenantId" = 'tnt_destaworks' WHERE "tenantId" IS NULL;
UPDATE "activity_log" SET "tenantId" = 'tnt_destaworks' WHERE "tenantId" IS NULL;
UPDATE "ai_usage_event" SET "tenantId" = 'tnt_destaworks' WHERE "tenantId" IS NULL;
UPDATE "ai_settings" SET "tenantId" = 'tnt_destaworks' WHERE "tenantId" IS NULL;
UPDATE "migration_runs" SET "tenantId" = 'tnt_destaworks' WHERE "tenantId" IS NULL;
UPDATE "clients" SET "tenantId" = 'tnt_destaworks' WHERE "tenantId" IS NULL;
UPDATE "client_contacts" SET "tenantId" = 'tnt_destaworks' WHERE "tenantId" IS NULL;
UPDATE "client_portal_tokens" SET "tenantId" = 'tnt_destaworks' WHERE "tenantId" IS NULL;
UPDATE "portal_access_requests" SET "tenantId" = 'tnt_destaworks' WHERE "tenantId" IS NULL;
UPDATE "client_tasks" SET "tenantId" = 'tnt_destaworks' WHERE "tenantId" IS NULL;
UPDATE "client_meetings" SET "tenantId" = 'tnt_destaworks' WHERE "tenantId" IS NULL;
UPDATE "client_notes" SET "tenantId" = 'tnt_destaworks' WHERE "tenantId" IS NULL;
UPDATE "deals" SET "tenantId" = 'tnt_destaworks' WHERE "tenantId" IS NULL;
UPDATE "deal_blockers" SET "tenantId" = 'tnt_destaworks' WHERE "tenantId" IS NULL;
UPDATE "client_rules" SET "tenantId" = 'tnt_destaworks' WHERE "tenantId" IS NULL;
UPDATE "candidates" SET "tenantId" = 'tnt_destaworks' WHERE "tenantId" IS NULL;
UPDATE "documents" SET "tenantId" = 'tnt_destaworks' WHERE "tenantId" IS NULL;
UPDATE "candidate_notes" SET "tenantId" = 'tnt_destaworks' WHERE "tenantId" IS NULL;
UPDATE "mentions" SET "tenantId" = 'tnt_destaworks' WHERE "tenantId" IS NULL;
UPDATE "stage_history" SET "tenantId" = 'tnt_destaworks' WHERE "tenantId" IS NULL;
UPDATE "screening_scorecards" SET "tenantId" = 'tnt_destaworks' WHERE "tenantId" IS NULL;
UPDATE "source_leads" SET "tenantId" = 'tnt_destaworks' WHERE "tenantId" IS NULL;
UPDATE "outreach_attempts" SET "tenantId" = 'tnt_destaworks' WHERE "tenantId" IS NULL;
UPDATE "daily_targets" SET "tenantId" = 'tnt_destaworks' WHERE "tenantId" IS NULL;
UPDATE "daily_actuals" SET "tenantId" = 'tnt_destaworks' WHERE "tenantId" IS NULL;
UPDATE "daily_logs" SET "tenantId" = 'tnt_destaworks' WHERE "tenantId" IS NULL;
UPDATE "journal_entries" SET "tenantId" = 'tnt_destaworks' WHERE "tenantId" IS NULL;
UPDATE "journal_goals" SET "tenantId" = 'tnt_destaworks' WHERE "tenantId" IS NULL;
UPDATE "manager_feedback" SET "tenantId" = 'tnt_destaworks' WHERE "tenantId" IS NULL;
UPDATE "saved_views" SET "tenantId" = 'tnt_destaworks' WHERE "tenantId" IS NULL;
UPDATE "open_roles" SET "tenantId" = 'tnt_destaworks' WHERE "tenantId" IS NULL;
UPDATE "role_notes" SET "tenantId" = 'tnt_destaworks' WHERE "tenantId" IS NULL;
UPDATE "client_match_profiles" SET "tenantId" = 'tnt_destaworks' WHERE "tenantId" IS NULL;
UPDATE "daily_briefs" SET "tenantId" = 'tnt_destaworks' WHERE "tenantId" IS NULL;
UPDATE "weekly_briefs" SET "tenantId" = 'tnt_destaworks' WHERE "tenantId" IS NULL;
UPDATE "prospects" SET "tenantId" = 'tnt_destaworks' WHERE "tenantId" IS NULL;
UPDATE "prospect_contacts" SET "tenantId" = 'tnt_destaworks' WHERE "tenantId" IS NULL;
UPDATE "saved_icps" SET "tenantId" = 'tnt_destaworks' WHERE "tenantId" IS NULL;
UPDATE "report_exports" SET "tenantId" = 'tnt_destaworks' WHERE "tenantId" IS NULL;
