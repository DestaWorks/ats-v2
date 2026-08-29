/**
 * Which models live inside a tenant and which live outside it — the single list that the three
 * independent enforcement mechanisms all read.
 *
 * There are three, deliberately, because each fails differently:
 *
 *  1. `tenant-scope.ts` injects `tenantId` into every `where` and `data`. Fails if a query reaches
 *     the database without going through the seam.
 *  2. The Row-Level Security policies (migration `20260830120000_enable_tenant_row_level_security`)
 *     filter in the database itself. Fails if the connection has no `app.tenant_id`, which is why
 *     it fails CLOSED — no setting means no rows, never all rows.
 *  3. The isolation suite (`packages/db/isolation`) proves 1 and 2 against a real Postgres.
 *
 * If those three read three hand-maintained lists, a model added to one and forgotten in another is
 * a silent cross-tenant leak. They read this one, and `scripts/check-rls-coverage.mjs` fails CI when
 * it drifts from `schema.prisma` or from the RLS migration.
 */

/**
 * Models that exist OUTSIDE any tenant, and must never have a `tenantId` injected into a query.
 *
 * `User` is the interesting one: one human has one login and may belong to many tenants, so the
 * user row is global and the tenant-specific facts (role, status) live on `Membership`. The three
 * Better Auth tables hang off the user for the same reason. `ScheduleRun` is platform
 * infrastructure — one claim per (schedule, occurrence) for the whole install, written by a
 * scheduler that runs outside any request.
 *
 * `Tenant` and `Membership` are themselves global: a query that filtered memberships by the active
 * tenant could never answer "which tenants may this user switch to".
 *
 * `Membership` is the one model here that HAS a `tenantId` and is still global — it IS the tenant
 * boundary rather than something inside it, so an RLS policy on it would break sign-in for anyone
 * with more than one membership. Its authorization is that every query filters by `userId`, which
 * the session establishes. `scripts/check-rls-coverage.mjs` carries that exception explicitly, so
 * a second model cannot acquire it by accident.
 */
export const GLOBAL_MODELS: ReadonlySet<string> = new Set([
  "User",
  "Session",
  "Account",
  "Verification",
  "ScheduleRun",
  "Tenant",
  "Membership",
]);

/** A tenant-scoped model and the table `@@map` puts it in. */
export interface TenantScopedModel {
  /** The Prisma model name, as `$allOperations` reports it. */
  readonly model: string;
  /** The physical table name, as the RLS policy names it. */
  readonly table: string;
}

/**
 * The 39 tenant-scoped models, in the order `schema.prisma` declares them.
 *
 * Every one carries `tenantId` and every one is covered by an RLS policy. The count is asserted in
 * CI rather than trusted: `scripts/check-rls-coverage.mjs` re-derives it from the schema.
 */
export const TENANT_SCOPED_MODELS: readonly TenantScopedModel[] = [
  { model: "AccessRequest", table: "access_request" },
  { model: "ActivityLog", table: "activity_log" },
  { model: "AiUsageEvent", table: "ai_usage_event" },
  { model: "AiSettings", table: "ai_settings" },
  { model: "MigrationRun", table: "migration_runs" },
  { model: "Client", table: "clients" },
  { model: "ClientContact", table: "client_contacts" },
  { model: "ClientPortalToken", table: "client_portal_tokens" },
  { model: "PortalAccessRequest", table: "portal_access_requests" },
  { model: "ClientTask", table: "client_tasks" },
  { model: "ClientMeeting", table: "client_meetings" },
  { model: "ClientNote", table: "client_notes" },
  { model: "Deal", table: "deals" },
  { model: "DealBlocker", table: "deal_blockers" },
  { model: "ClientRules", table: "client_rules" },
  { model: "Candidate", table: "candidates" },
  { model: "Document", table: "documents" },
  { model: "CandidateNote", table: "candidate_notes" },
  { model: "Mention", table: "mentions" },
  { model: "StageHistory", table: "stage_history" },
  { model: "ScreeningScorecard", table: "screening_scorecards" },
  { model: "SourceLead", table: "source_leads" },
  { model: "OutreachAttempt", table: "outreach_attempts" },
  { model: "DailyTarget", table: "daily_targets" },
  { model: "DailyActual", table: "daily_actuals" },
  { model: "DailyLog", table: "daily_logs" },
  { model: "JournalEntry", table: "journal_entries" },
  { model: "JournalGoal", table: "journal_goals" },
  { model: "ManagerFeedback", table: "manager_feedback" },
  { model: "SavedView", table: "saved_views" },
  { model: "OpenRole", table: "open_roles" },
  { model: "RoleNote", table: "role_notes" },
  { model: "ClientMatchProfile", table: "client_match_profiles" },
  { model: "DailyBrief", table: "daily_briefs" },
  { model: "WeeklyBrief", table: "weekly_briefs" },
  { model: "Prospect", table: "prospects" },
  { model: "ProspectContact", table: "prospect_contacts" },
  { model: "SavedIcp", table: "saved_icps" },
  { model: "ReportExport", table: "report_exports" },
];

/**
 * The session variable the RLS policies read.
 *
 * Named in one place because it appears in three: the policy SQL, the `set_config` call that sets
 * it, and the isolation suite that asserts an unset one yields zero rows. A typo in any of the
 * three is a silent failure — the policy would compare against a parameter nobody sets, and the
 * table would simply look empty.
 */
export const TENANT_SETTING = "app.tenant_id";
