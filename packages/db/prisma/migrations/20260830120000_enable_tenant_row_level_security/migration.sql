-- Phase 6.6 — the Row-Level Security backstop.
--
-- WHAT THIS IS FOR
-- The primary control is the enforcement seam in `packages/db/src/tenant-scope.ts`, which adds
-- `tenantId` to every `where` and `data`. This is the second, independent control: a query that
-- somehow reaches Postgres WITHOUT that injection returns zero rows instead of another tenant's
-- data. Two mechanisms with different failure modes, because a cross-tenant read here discloses
-- the PII/PHI of medical professionals.
--
-- FAIL CLOSED, NEVER OPEN
-- The predicate is `"tenantId" = current_setting('app.tenant_id', true)`. The second argument is
-- `missing_ok`: with no setting on the connection, `current_setting` returns NULL rather than
-- raising, the comparison evaluates to NULL, and the row is filtered out. So a connection that
-- forgot to identify its tenant sees NOTHING. The alternative — omitting `missing_ok` — makes an
-- unset connection raise `42704`, which is also safe but turns a scoping bug into an opaque
-- database error instead of an obviously empty result.
--
-- WHY `FORCE`, WHICH THE PLAN'S SKETCH OMITS
-- `ENABLE ROW LEVEL SECURITY` alone does not apply to the table's OWNER. On Supabase the
-- application connects as the same role that owns these tables, so `ENABLE` on its own would be
-- decoration — every policy below would be skipped for exactly the connection it exists to
-- constrain. `FORCE` removes the owner exemption. SAAS-RESTRUCTURE-PLAN 6.0 has been corrected.
--
-- THE OPERATIONAL COST OF `FORCE` — READ BEFORE THE NEXT DATA MIGRATION
-- `FORCE` binds the owner too, so a later migration that rewrites tenant data sees only the rows
-- of whatever `app.tenant_id` is set to — i.e. none, since `prisma migrate` sets nothing. A
-- cross-tenant maintenance job therefore needs ONE of:
--   (a) a role with `BYPASSRLS` (`ALTER ROLE <migrator> BYPASSRLS`) used for that job only, or
--   (b) an explicit per-tenant loop that sets `app.tenant_id` for each tenant in turn, or
--   (c) `ALTER TABLE ... NO FORCE ROW LEVEL SECURITY` for the duration of a maintenance window.
-- (a) is the right default and is a hosting/credentials decision, not a code one — it is recorded
-- here so the next person hitting "my migration updated 0 rows" finds the reason immediately.
--
-- ORDERING
-- This migration MUST land after 6.2's backfill+contract. A row whose `tenantId` is still NULL
-- can never satisfy the predicate and would vanish from the application the moment RLS is on. The
-- guard block below refuses to proceed rather than let that happen quietly.

-- Refuse to enable RLS while any tenant-scoped row is unassigned: those rows would become
-- invisible to every connection, which looks exactly like data loss.
DO $$
DECLARE
  target text;
  orphans bigint;
BEGIN
  FOREACH target IN ARRAY ARRAY[
    'access_request',
    'activity_log',
    'ai_usage_event',
    'ai_settings',
    'migration_runs',
    'clients',
    'client_contacts',
    'client_portal_tokens',
    'portal_access_requests',
    'client_tasks',
    'client_meetings',
    'client_notes',
    'deals',
    'deal_blockers',
    'client_rules',
    'candidates',
    'documents',
    'candidate_notes',
    'mentions',
    'stage_history',
    'screening_scorecards',
    'source_leads',
    'outreach_attempts',
    'daily_targets',
    'daily_actuals',
    'daily_logs',
    'journal_entries',
    'journal_goals',
    'manager_feedback',
    'saved_views',
    'open_roles',
    'role_notes',
    'client_match_profiles',
    'daily_briefs',
    'weekly_briefs',
    'prospects',
    'prospect_contacts',
    'saved_icps',
    'report_exports'
  ]
  LOOP
    EXECUTE format('SELECT count(*) FROM %I WHERE "tenantId" IS NULL', target) INTO orphans;
    IF orphans > 0 THEN
      RAISE EXCEPTION
        'Refusing to enable RLS: %.tenantId is NULL for % row(s). Land the 6.2 backfill first, or those rows become invisible to every tenant.',
        target, orphans;
    END IF;
  END LOOP;
END
$$;

-- access_request
ALTER TABLE "access_request" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "access_request" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation" ON "access_request";
CREATE POLICY "tenant_isolation" ON "access_request"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

-- activity_log
ALTER TABLE "activity_log" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "activity_log" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation" ON "activity_log";
CREATE POLICY "tenant_isolation" ON "activity_log"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

-- ai_usage_event
ALTER TABLE "ai_usage_event" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ai_usage_event" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation" ON "ai_usage_event";
CREATE POLICY "tenant_isolation" ON "ai_usage_event"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

-- ai_settings
ALTER TABLE "ai_settings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ai_settings" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation" ON "ai_settings";
CREATE POLICY "tenant_isolation" ON "ai_settings"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

-- migration_runs
ALTER TABLE "migration_runs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "migration_runs" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation" ON "migration_runs";
CREATE POLICY "tenant_isolation" ON "migration_runs"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

-- clients
ALTER TABLE "clients" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "clients" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation" ON "clients";
CREATE POLICY "tenant_isolation" ON "clients"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

-- client_contacts
ALTER TABLE "client_contacts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "client_contacts" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation" ON "client_contacts";
CREATE POLICY "tenant_isolation" ON "client_contacts"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

-- client_portal_tokens
ALTER TABLE "client_portal_tokens" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "client_portal_tokens" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation" ON "client_portal_tokens";
CREATE POLICY "tenant_isolation" ON "client_portal_tokens"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

-- portal_access_requests
ALTER TABLE "portal_access_requests" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "portal_access_requests" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation" ON "portal_access_requests";
CREATE POLICY "tenant_isolation" ON "portal_access_requests"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

-- client_tasks
ALTER TABLE "client_tasks" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "client_tasks" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation" ON "client_tasks";
CREATE POLICY "tenant_isolation" ON "client_tasks"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

-- client_meetings
ALTER TABLE "client_meetings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "client_meetings" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation" ON "client_meetings";
CREATE POLICY "tenant_isolation" ON "client_meetings"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

-- client_notes
ALTER TABLE "client_notes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "client_notes" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation" ON "client_notes";
CREATE POLICY "tenant_isolation" ON "client_notes"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

-- deals
ALTER TABLE "deals" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "deals" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation" ON "deals";
CREATE POLICY "tenant_isolation" ON "deals"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

-- deal_blockers
ALTER TABLE "deal_blockers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "deal_blockers" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation" ON "deal_blockers";
CREATE POLICY "tenant_isolation" ON "deal_blockers"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

-- client_rules
ALTER TABLE "client_rules" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "client_rules" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation" ON "client_rules";
CREATE POLICY "tenant_isolation" ON "client_rules"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

-- candidates
ALTER TABLE "candidates" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "candidates" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation" ON "candidates";
CREATE POLICY "tenant_isolation" ON "candidates"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

-- documents
ALTER TABLE "documents" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "documents" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation" ON "documents";
CREATE POLICY "tenant_isolation" ON "documents"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

-- candidate_notes
ALTER TABLE "candidate_notes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "candidate_notes" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation" ON "candidate_notes";
CREATE POLICY "tenant_isolation" ON "candidate_notes"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

-- mentions
ALTER TABLE "mentions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "mentions" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation" ON "mentions";
CREATE POLICY "tenant_isolation" ON "mentions"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

-- stage_history
ALTER TABLE "stage_history" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "stage_history" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation" ON "stage_history";
CREATE POLICY "tenant_isolation" ON "stage_history"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

-- screening_scorecards
ALTER TABLE "screening_scorecards" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "screening_scorecards" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation" ON "screening_scorecards";
CREATE POLICY "tenant_isolation" ON "screening_scorecards"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

-- source_leads
ALTER TABLE "source_leads" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "source_leads" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation" ON "source_leads";
CREATE POLICY "tenant_isolation" ON "source_leads"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

-- outreach_attempts
ALTER TABLE "outreach_attempts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "outreach_attempts" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation" ON "outreach_attempts";
CREATE POLICY "tenant_isolation" ON "outreach_attempts"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

-- daily_targets
ALTER TABLE "daily_targets" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "daily_targets" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation" ON "daily_targets";
CREATE POLICY "tenant_isolation" ON "daily_targets"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

-- daily_actuals
ALTER TABLE "daily_actuals" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "daily_actuals" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation" ON "daily_actuals";
CREATE POLICY "tenant_isolation" ON "daily_actuals"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

-- daily_logs
ALTER TABLE "daily_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "daily_logs" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation" ON "daily_logs";
CREATE POLICY "tenant_isolation" ON "daily_logs"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

-- journal_entries
ALTER TABLE "journal_entries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "journal_entries" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation" ON "journal_entries";
CREATE POLICY "tenant_isolation" ON "journal_entries"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

-- journal_goals
ALTER TABLE "journal_goals" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "journal_goals" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation" ON "journal_goals";
CREATE POLICY "tenant_isolation" ON "journal_goals"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

-- manager_feedback
ALTER TABLE "manager_feedback" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "manager_feedback" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation" ON "manager_feedback";
CREATE POLICY "tenant_isolation" ON "manager_feedback"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

-- saved_views
ALTER TABLE "saved_views" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "saved_views" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation" ON "saved_views";
CREATE POLICY "tenant_isolation" ON "saved_views"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

-- open_roles
ALTER TABLE "open_roles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "open_roles" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation" ON "open_roles";
CREATE POLICY "tenant_isolation" ON "open_roles"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

-- role_notes
ALTER TABLE "role_notes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "role_notes" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation" ON "role_notes";
CREATE POLICY "tenant_isolation" ON "role_notes"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

-- client_match_profiles
ALTER TABLE "client_match_profiles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "client_match_profiles" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation" ON "client_match_profiles";
CREATE POLICY "tenant_isolation" ON "client_match_profiles"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

-- daily_briefs
ALTER TABLE "daily_briefs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "daily_briefs" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation" ON "daily_briefs";
CREATE POLICY "tenant_isolation" ON "daily_briefs"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

-- weekly_briefs
ALTER TABLE "weekly_briefs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "weekly_briefs" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation" ON "weekly_briefs";
CREATE POLICY "tenant_isolation" ON "weekly_briefs"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

-- prospects
ALTER TABLE "prospects" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "prospects" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation" ON "prospects";
CREATE POLICY "tenant_isolation" ON "prospects"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

-- prospect_contacts
ALTER TABLE "prospect_contacts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "prospect_contacts" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation" ON "prospect_contacts";
CREATE POLICY "tenant_isolation" ON "prospect_contacts"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

-- saved_icps
ALTER TABLE "saved_icps" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "saved_icps" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation" ON "saved_icps";
CREATE POLICY "tenant_isolation" ON "saved_icps"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

-- report_exports
ALTER TABLE "report_exports" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "report_exports" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation" ON "report_exports";
CREATE POLICY "tenant_isolation" ON "report_exports"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));
