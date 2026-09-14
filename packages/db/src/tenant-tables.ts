/**
 * The tenant-scoped tables, and the Prisma delegate that reads each one.
 *
 * This is the list `20260829111500_tenants_expand` adds `tenantId` to,
 * `20260829112000_tenants_backfill` fills, and `20260829112500_tenants_contract` makes required —
 * so it is also the list a reconciliation has to cover to prove anything. It lives in code rather
 * than being re-derived per caller because three things need the same 39 names and a list that
 * drifts between them proves the wrong database.
 *
 * It is the exact complement of `GLOBAL_MODELS` in `tenant-scope.ts`: every model in the schema is
 * in one set or the other, and `tenant-tables.test.ts` asserts that against schema.prisma so a
 * model added later cannot quietly land in neither.
 */

/** `[Prisma delegate, Postgres table]`, in schema declaration order. */
const TABLES = [
  ["accessRequest", "access_request"],
  ["activityLog", "activity_log"],
  ["aiUsageEvent", "ai_usage_event"],
  ["aiSettings", "ai_settings"],
  ["migrationRun", "migration_runs"],
  ["client", "clients"],
  ["clientContact", "client_contacts"],
  ["clientPortalToken", "client_portal_tokens"],
  ["portalAccessRequest", "portal_access_requests"],
  ["clientTask", "client_tasks"],
  ["clientMeeting", "client_meetings"],
  ["clientNote", "client_notes"],
  ["deal", "deals"],
  ["dealBlocker", "deal_blockers"],
  ["clientRules", "client_rules"],
  ["candidate", "candidates"],
  ["document", "documents"],
  ["candidateNote", "candidate_notes"],
  ["mention", "mentions"],
  ["stageHistory", "stage_history"],
  ["screeningScorecard", "screening_scorecards"],
  ["sourceLead", "source_leads"],
  ["outreachAttempt", "outreach_attempts"],
  ["dailyTarget", "daily_targets"],
  ["dailyActual", "daily_actuals"],
  ["dailyLog", "daily_logs"],
  ["journalEntry", "journal_entries"],
  ["journalGoal", "journal_goals"],
  ["managerFeedback", "manager_feedback"],
  ["savedView", "saved_views"],
  ["openRole", "open_roles"],
  ["roleNote", "role_notes"],
  ["clientMatchProfile", "client_match_profiles"],
  ["dailyBrief", "daily_briefs"],
  ["weeklyBrief", "weekly_briefs"],
  ["prospect", "prospects"],
  ["prospectContact", "prospect_contacts"],
  ["savedIcp", "saved_icps"],
  ["reportExport", "report_exports"],
] as const;

/** A Postgres table that carries `tenantId`. */
export type TenantScopedTable = (typeof TABLES)[number][1];
/** The Prisma delegate name for a tenant-scoped table. */
export type TenantScopedDelegate = (typeof TABLES)[number][0];

export const TENANT_SCOPED_TABLES: readonly TenantScopedTable[] = TABLES.map(([, table]) => table);

export const TENANT_SCOPED_DELEGATES: readonly TenantScopedDelegate[] = TABLES.map(
  ([delegate]) => delegate,
);

/** `delegate -> table`, for a runner that queries through Prisma but reports in SQL terms. */
export const TENANT_SCOPED_TABLE_BY_DELEGATE: ReadonlyMap<TenantScopedDelegate, TenantScopedTable> =
  new Map(TABLES);

/**
 * The id of tenant #1, created by `20260829112000_tenants_backfill`.
 *
 * A fixed literal rather than a generated cuid, because the migration, this reconciliation and the
 * Phase 7 Sheet ETL all have to name the same tenant and none of them can look it up.
 */
export const FOUNDING_TENANT_ID = "tnt_destaworks";
