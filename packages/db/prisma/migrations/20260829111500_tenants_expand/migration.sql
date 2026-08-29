-- Phase 6.1 (SAAS-RESTRUCTURE-PLAN) — the EXPAND half of expand-then-contract.
--
-- Commit 4331163 added `Tenant`, `Membership` and a nullable `tenantId` on 39 models to
-- schema.prisma but shipped no migration, so the SQL history had no tenants table for 6.2's
-- backfill to reference. This is that missing step, authored to match the committed schema
-- exactly rather than re-deciding it.
--
-- Every column here is NULLABLE and every index is additive: this migration can run against the
-- live database while the current single-tenant app keeps serving, which is the whole point of
-- splitting expand from contract. `20260829112000_tenants_backfill` fills the columns and
-- `20260829112500_tenants_contract` makes them required.
--
-- Hand-written, not diffed. `prisma migrate dev` would propose dropping the four raw-SQL indexes
-- (three GIN trigram, one partial unique on lower(email)) as drift, because they are deliberately
-- absent from schema.prisma — the regression documented in
-- 20260807102900_restore_pg_trgm_candidate_search_indexes and now guarded by
-- `scripts/check-raw-sql-indexes.mjs`.
--
-- `ADD COLUMN` with no default is metadata-only on PostgreSQL 11+, so the 39 ALTERs do not
-- rewrite a single row. The index builds do take a write lock per table; they are not
-- `CONCURRENTLY` because Prisma runs each migration inside one transaction and
-- `CREATE INDEX CONCURRENTLY` is not permitted there. The tables are small enough at cutover
-- that a brief lock is the cheaper trade than splitting the migration engine.

-- CreateTable
CREATE TABLE "tenants" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "plan" TEXT NOT NULL DEFAULT 'trial',
    "seatLimit" INTEGER,
    "trialEndsAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tenants_slug_key" ON "tenants"("slug");

-- CreateTable
CREATE TABLE "memberships" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'Associate',
    "status" TEXT NOT NULL DEFAULT 'active',
    "invitedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "memberships_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "memberships_userId_idx" ON "memberships"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "memberships_tenantId_userId_key" ON "memberships"("tenantId", "userId");

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- The 39 tenant-scoped tables. `user`, `session`, `account`, `verification` and
-- `schedule_runs` are deliberately absent: they live outside any tenant (see the GLOBAL_MODELS
-- allowlist in packages/db/src/tenant-scope.ts for why each one is there).

-- AlterTable
ALTER TABLE "access_request" ADD COLUMN "tenantId" TEXT;

-- CreateIndex
CREATE INDEX "access_request_tenantId_idx" ON "access_request"("tenantId");

-- AddForeignKey
ALTER TABLE "access_request" ADD CONSTRAINT "access_request_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "activity_log" ADD COLUMN "tenantId" TEXT;

-- CreateIndex
CREATE INDEX "activity_log_tenantId_idx" ON "activity_log"("tenantId");

-- AddForeignKey
ALTER TABLE "activity_log" ADD CONSTRAINT "activity_log_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "ai_usage_event" ADD COLUMN "tenantId" TEXT;

-- CreateIndex
CREATE INDEX "ai_usage_event_tenantId_idx" ON "ai_usage_event"("tenantId");

-- AddForeignKey
ALTER TABLE "ai_usage_event" ADD CONSTRAINT "ai_usage_event_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "ai_settings" ADD COLUMN "tenantId" TEXT;

-- CreateIndex
CREATE INDEX "ai_settings_tenantId_idx" ON "ai_settings"("tenantId");

-- AddForeignKey
ALTER TABLE "ai_settings" ADD CONSTRAINT "ai_settings_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "migration_runs" ADD COLUMN "tenantId" TEXT;

-- CreateIndex
CREATE INDEX "migration_runs_tenantId_idx" ON "migration_runs"("tenantId");

-- AddForeignKey
ALTER TABLE "migration_runs" ADD CONSTRAINT "migration_runs_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "clients" ADD COLUMN "tenantId" TEXT;

-- CreateIndex
CREATE INDEX "clients_tenantId_idx" ON "clients"("tenantId");

-- AddForeignKey
ALTER TABLE "clients" ADD CONSTRAINT "clients_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "client_contacts" ADD COLUMN "tenantId" TEXT;

-- CreateIndex
CREATE INDEX "client_contacts_tenantId_idx" ON "client_contacts"("tenantId");

-- AddForeignKey
ALTER TABLE "client_contacts" ADD CONSTRAINT "client_contacts_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "client_portal_tokens" ADD COLUMN "tenantId" TEXT;

-- CreateIndex
CREATE INDEX "client_portal_tokens_tenantId_idx" ON "client_portal_tokens"("tenantId");

-- AddForeignKey
ALTER TABLE "client_portal_tokens" ADD CONSTRAINT "client_portal_tokens_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "portal_access_requests" ADD COLUMN "tenantId" TEXT;

-- CreateIndex
CREATE INDEX "portal_access_requests_tenantId_idx" ON "portal_access_requests"("tenantId");

-- AddForeignKey
ALTER TABLE "portal_access_requests" ADD CONSTRAINT "portal_access_requests_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "client_tasks" ADD COLUMN "tenantId" TEXT;

-- CreateIndex
CREATE INDEX "client_tasks_tenantId_idx" ON "client_tasks"("tenantId");

-- AddForeignKey
ALTER TABLE "client_tasks" ADD CONSTRAINT "client_tasks_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "client_meetings" ADD COLUMN "tenantId" TEXT;

-- CreateIndex
CREATE INDEX "client_meetings_tenantId_idx" ON "client_meetings"("tenantId");

-- AddForeignKey
ALTER TABLE "client_meetings" ADD CONSTRAINT "client_meetings_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "client_notes" ADD COLUMN "tenantId" TEXT;

-- CreateIndex
CREATE INDEX "client_notes_tenantId_idx" ON "client_notes"("tenantId");

-- AddForeignKey
ALTER TABLE "client_notes" ADD CONSTRAINT "client_notes_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "deals" ADD COLUMN "tenantId" TEXT;

-- CreateIndex
CREATE INDEX "deals_tenantId_idx" ON "deals"("tenantId");

-- AddForeignKey
ALTER TABLE "deals" ADD CONSTRAINT "deals_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "deal_blockers" ADD COLUMN "tenantId" TEXT;

-- CreateIndex
CREATE INDEX "deal_blockers_tenantId_idx" ON "deal_blockers"("tenantId");

-- AddForeignKey
ALTER TABLE "deal_blockers" ADD CONSTRAINT "deal_blockers_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "client_rules" ADD COLUMN "tenantId" TEXT;

-- CreateIndex
CREATE INDEX "client_rules_tenantId_idx" ON "client_rules"("tenantId");

-- AddForeignKey
ALTER TABLE "client_rules" ADD CONSTRAINT "client_rules_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "candidates" ADD COLUMN "tenantId" TEXT;

-- CreateIndex
CREATE INDEX "candidates_tenantId_idx" ON "candidates"("tenantId");

-- AddForeignKey
ALTER TABLE "candidates" ADD CONSTRAINT "candidates_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "documents" ADD COLUMN "tenantId" TEXT;

-- CreateIndex
CREATE INDEX "documents_tenantId_idx" ON "documents"("tenantId");

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "candidate_notes" ADD COLUMN "tenantId" TEXT;

-- CreateIndex
CREATE INDEX "candidate_notes_tenantId_idx" ON "candidate_notes"("tenantId");

-- AddForeignKey
ALTER TABLE "candidate_notes" ADD CONSTRAINT "candidate_notes_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "mentions" ADD COLUMN "tenantId" TEXT;

-- CreateIndex
CREATE INDEX "mentions_tenantId_idx" ON "mentions"("tenantId");

-- AddForeignKey
ALTER TABLE "mentions" ADD CONSTRAINT "mentions_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "stage_history" ADD COLUMN "tenantId" TEXT;

-- CreateIndex
CREATE INDEX "stage_history_tenantId_idx" ON "stage_history"("tenantId");

-- AddForeignKey
ALTER TABLE "stage_history" ADD CONSTRAINT "stage_history_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "screening_scorecards" ADD COLUMN "tenantId" TEXT;

-- CreateIndex
CREATE INDEX "screening_scorecards_tenantId_idx" ON "screening_scorecards"("tenantId");

-- AddForeignKey
ALTER TABLE "screening_scorecards" ADD CONSTRAINT "screening_scorecards_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "source_leads" ADD COLUMN "tenantId" TEXT;

-- CreateIndex
CREATE INDEX "source_leads_tenantId_idx" ON "source_leads"("tenantId");

-- AddForeignKey
ALTER TABLE "source_leads" ADD CONSTRAINT "source_leads_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "outreach_attempts" ADD COLUMN "tenantId" TEXT;

-- CreateIndex
CREATE INDEX "outreach_attempts_tenantId_idx" ON "outreach_attempts"("tenantId");

-- AddForeignKey
ALTER TABLE "outreach_attempts" ADD CONSTRAINT "outreach_attempts_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "daily_targets" ADD COLUMN "tenantId" TEXT;

-- CreateIndex
CREATE INDEX "daily_targets_tenantId_idx" ON "daily_targets"("tenantId");

-- AddForeignKey
ALTER TABLE "daily_targets" ADD CONSTRAINT "daily_targets_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "daily_actuals" ADD COLUMN "tenantId" TEXT;

-- CreateIndex
CREATE INDEX "daily_actuals_tenantId_idx" ON "daily_actuals"("tenantId");

-- AddForeignKey
ALTER TABLE "daily_actuals" ADD CONSTRAINT "daily_actuals_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "daily_logs" ADD COLUMN "tenantId" TEXT;

-- CreateIndex
CREATE INDEX "daily_logs_tenantId_idx" ON "daily_logs"("tenantId");

-- AddForeignKey
ALTER TABLE "daily_logs" ADD CONSTRAINT "daily_logs_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "journal_entries" ADD COLUMN "tenantId" TEXT;

-- CreateIndex
CREATE INDEX "journal_entries_tenantId_idx" ON "journal_entries"("tenantId");

-- AddForeignKey
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "journal_goals" ADD COLUMN "tenantId" TEXT;

-- CreateIndex
CREATE INDEX "journal_goals_tenantId_idx" ON "journal_goals"("tenantId");

-- AddForeignKey
ALTER TABLE "journal_goals" ADD CONSTRAINT "journal_goals_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "manager_feedback" ADD COLUMN "tenantId" TEXT;

-- CreateIndex
CREATE INDEX "manager_feedback_tenantId_idx" ON "manager_feedback"("tenantId");

-- AddForeignKey
ALTER TABLE "manager_feedback" ADD CONSTRAINT "manager_feedback_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "saved_views" ADD COLUMN "tenantId" TEXT;

-- CreateIndex
CREATE INDEX "saved_views_tenantId_idx" ON "saved_views"("tenantId");

-- AddForeignKey
ALTER TABLE "saved_views" ADD CONSTRAINT "saved_views_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "open_roles" ADD COLUMN "tenantId" TEXT;

-- CreateIndex
CREATE INDEX "open_roles_tenantId_idx" ON "open_roles"("tenantId");

-- AddForeignKey
ALTER TABLE "open_roles" ADD CONSTRAINT "open_roles_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "role_notes" ADD COLUMN "tenantId" TEXT;

-- CreateIndex
CREATE INDEX "role_notes_tenantId_idx" ON "role_notes"("tenantId");

-- AddForeignKey
ALTER TABLE "role_notes" ADD CONSTRAINT "role_notes_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "client_match_profiles" ADD COLUMN "tenantId" TEXT;

-- CreateIndex
CREATE INDEX "client_match_profiles_tenantId_idx" ON "client_match_profiles"("tenantId");

-- AddForeignKey
ALTER TABLE "client_match_profiles" ADD CONSTRAINT "client_match_profiles_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "daily_briefs" ADD COLUMN "tenantId" TEXT;

-- CreateIndex
CREATE INDEX "daily_briefs_tenantId_idx" ON "daily_briefs"("tenantId");

-- AddForeignKey
ALTER TABLE "daily_briefs" ADD CONSTRAINT "daily_briefs_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "weekly_briefs" ADD COLUMN "tenantId" TEXT;

-- CreateIndex
CREATE INDEX "weekly_briefs_tenantId_idx" ON "weekly_briefs"("tenantId");

-- AddForeignKey
ALTER TABLE "weekly_briefs" ADD CONSTRAINT "weekly_briefs_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "prospects" ADD COLUMN "tenantId" TEXT;

-- CreateIndex
CREATE INDEX "prospects_tenantId_idx" ON "prospects"("tenantId");

-- AddForeignKey
ALTER TABLE "prospects" ADD CONSTRAINT "prospects_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "prospect_contacts" ADD COLUMN "tenantId" TEXT;

-- CreateIndex
CREATE INDEX "prospect_contacts_tenantId_idx" ON "prospect_contacts"("tenantId");

-- AddForeignKey
ALTER TABLE "prospect_contacts" ADD CONSTRAINT "prospect_contacts_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "saved_icps" ADD COLUMN "tenantId" TEXT;

-- CreateIndex
CREATE INDEX "saved_icps_tenantId_idx" ON "saved_icps"("tenantId");

-- AddForeignKey
ALTER TABLE "saved_icps" ADD CONSTRAINT "saved_icps_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "report_exports" ADD COLUMN "tenantId" TEXT;

-- CreateIndex
CREATE INDEX "report_exports_tenantId_idx" ON "report_exports"("tenantId");

-- AddForeignKey
ALTER TABLE "report_exports" ADD CONSTRAINT "report_exports_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
