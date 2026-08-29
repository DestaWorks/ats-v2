import { systemContextFor } from "@destaworks/domain/system-context";
import { db } from "../prisma";
import { withTenantTransaction } from "../tenant-transaction";

/**
 * Data access for the installation-wide view (SAAS-RESTRUCTURE-PLAN 6.8 / Phase 8).
 *
 * ── The problem this file exists to solve ──────────────────────────────────────────────────────
 *
 * A platform metric is a cross-tenant aggregate, and cross-tenant is the one thing the rest of
 * `packages/db` is built to make impossible. Row-Level Security is ENABLED and FORCED on all 39
 * tenant-scoped tables, and the policy compares `tenantId` against
 * `current_setting('app.tenant_id', true)`. On a connection that never announced a tenant that
 * setting is NULL, the comparison is NULL, and every row is filtered out. So the naive spelling of
 * "sum the AI usage of the whole installation" — one `aggregate` on an unscoped client — does not
 * return a wrong number. It returns ZERO, silently, and only once RLS is applied to the database,
 * which is after this code is written and reviewed.
 *
 * The migration header lists three ways out. Two are refused here:
 *
 *   (a) a `BYPASSRLS` role — it disarms the backstop for whatever runs on it, and a metrics
 *       dashboard is not worth a credential that can read every tenant's PII unfiltered.
 *   (c) `NO FORCE` for a maintenance window — not applicable to a request-time read at all.
 *
 * This file takes (b): **announce each tenant in turn.** Every tenant-scoped read below runs
 * inside `withTenantTransaction`, which opens one transaction per tenant, sets `app.tenant_id` as
 * its first statement, and hands back a client the seam has already bound to that tenant.
 *
 * ── Why BOTH mechanisms, and why that is not belt-and-braces theatre ──────────────────────────
 *
 * Inside that transaction the query is filtered twice: the seam injects `tenantId` into the
 * `where`, and the RLS policy filters again in Postgres. That redundancy is load-bearing HERE in a
 * way it is not elsewhere, because the two mechanisms are live at different times. RLS is written
 * but not yet applied, so today only the seam's injection makes the loop correct — without it each
 * iteration would read EVERY tenant's rows and the totals would be multiplied by the tenant count.
 * Once the migration lands, the announcement is what stops each iteration returning nothing. A
 * per-tenant loop that relied on either mechanism alone would be wrong in one of the two worlds.
 *
 * ── What is global, and therefore not a problem at all ────────────────────────────────────────
 *
 * `Tenant`, `Membership`, `Session` and `ScheduleRun` are in the seam's `GLOBAL_MODELS` allowlist
 * and carry no RLS policy, because they are facts about the installation rather than contents of a
 * tenant. Aggregating over them needs no announcement and no loop, exactly as
 * `user.repository.ts` and `schedule-run.repository.ts` already read them. Most of the metrics
 * below are deliberately built from these, so the expensive per-tenant walk is reserved for the
 * two questions that genuinely cannot be answered any other way.
 *
 * Nothing here reads an individual row of tenant data. Every tenant-scoped query is a `count` or
 * an `aggregate`, so no candidate, contact or user can be reached through this surface even by a
 * caller who has already cleared the platform guard.
 */

/** How many tenants one metrics read will walk. Bounds the loop; surfaced as `truncated`. */
export const TENANT_SCAN_LIMIT = 500;

/** Bounds on the global reads, so none of them is an unbounded scan. */
const SIGNUP_SCAN_LIMIT = 5_000;
const SESSION_SCAN_LIMIT = 10_000;
const SCHEDULE_LIMIT = 100;

export interface PlatformBucketRow {
  key: string;
  count: number;
}

export interface PlatformTenantCountsRow {
  total: number;
  byStatus: PlatformBucketRow[];
  byPlan: PlatformBucketRow[];
}

export interface PlatformSeatsRow {
  seatsLicensed: number;
  seatsUsed: number;
  tenantsWithoutSeatLimit: number;
}

export interface PlatformScheduleRow {
  schedule: string;
  runs: number;
  lastOccurrenceAt: Date | null;
}

/** The two questions that have to be asked inside a tenant, answered for exactly one. */
export interface TenantScopedUsageRow {
  aiCalls: number;
  aiErrors: number;
  aiInputTokens: number;
  aiOutputTokens: number;
  documents: number;
  documentBytes: number;
  documentsOfUnknownSize: number;
}

const LIVE = { deletedAt: null } as const;

export const platformMetricsRepository = {
  /** Workspace counts by lifecycle status and by plan. Two grouped reads of a global table. */
  async tenantCounts(): Promise<PlatformTenantCountsRow> {
    const [byStatus, byPlan, total] = await Promise.all([
      db().tenant.groupBy({ by: ["status"], where: LIVE, _count: { _all: true } }),
      db().tenant.groupBy({ by: ["plan"], where: LIVE, _count: { _all: true } }),
      db().tenant.count({ where: LIVE }),
    ]);
    return {
      total,
      byStatus: byStatus.map((row) => ({ key: row.status, count: row._count._all })),
      byPlan: byPlan.map((row) => ({ key: row.plan, count: row._count._all })),
    };
  },

  /** Seat licensing across the installation. Totals, never a per-tenant comparison. */
  async seatTotals(): Promise<PlatformSeatsRow> {
    const [licensed, unlimited, used] = await Promise.all([
      db().tenant.aggregate({ where: LIVE, _sum: { seatLimit: true } }),
      db().tenant.count({ where: { ...LIVE, seatLimit: null } }),
      db().membership.count({ where: { status: "active", tenant: LIVE } }),
    ]);
    return {
      seatsLicensed: licensed._sum.seatLimit ?? 0,
      seatsUsed: used,
      tenantsWithoutSeatLimit: unlimited,
    };
  },

  /**
   * When each workspace in the window was created.
   *
   * Returns the instants rather than day buckets: bucketing is calendar arithmetic, which lives in
   * `domain`'s day helpers and not in a repository. Bounded by the window and by `take`.
   */
  async signupInstants(since: Date, until: Date): Promise<Date[]> {
    const rows = await db().tenant.findMany({
      where: { ...LIVE, createdAt: { gte: since, lt: until } },
      select: { createdAt: true },
      orderBy: { createdAt: "asc" },
      take: SIGNUP_SCAN_LIMIT,
    });
    return rows.map((row) => row.createdAt);
  },

  /**
   * Live tenants with at least one active member holding an unexpired session.
   *
   * "Active" is deliberately defined on `Session` and `Membership` — both global — rather than on
   * any tenant's `activity_log`, which is tenant-scoped and would have turned the cheapest metric
   * on this page into a second per-tenant walk for no extra truth.
   */
  async activeTenantCount(now: Date): Promise<number> {
    const sessions = await db().session.findMany({
      where: { expiresAt: { gt: now } },
      select: { userId: true },
      take: SESSION_SCAN_LIMIT,
    });
    const userIds = [...new Set(sessions.map((row) => row.userId))];
    if (userIds.length === 0) return 0;

    const memberships = await db().membership.findMany({
      where: { userId: { in: userIds }, status: "active", tenant: LIVE },
      select: { tenantId: true },
      take: SESSION_SCAN_LIMIT,
    });
    return new Set(memberships.map((row) => row.tenantId)).size;
  },

  /** Background-schedule claims in the window. `ScheduleRun` is install-wide infrastructure. */
  async scheduleHealth(since: Date, until: Date): Promise<PlatformScheduleRow[]> {
    const rows = await db().scheduleRun.groupBy({
      by: ["schedule"],
      where: { claimedAt: { gte: since, lt: until } },
      _count: { _all: true },
      _max: { occurrenceAt: true },
      orderBy: { schedule: "asc" },
      take: SCHEDULE_LIMIT,
    });
    return rows.map((row) => ({
      schedule: row.schedule,
      runs: row._count._all,
      lastOccurrenceAt: row._max.occurrenceAt,
    }));
  },

  /** How many live tenants there are, and the first `TENANT_SCAN_LIMIT` of them to walk. */
  async tenantsToScan(): Promise<{ ids: string[]; total: number }> {
    const [rows, total] = await Promise.all([
      db().tenant.findMany({
        where: LIVE,
        select: { id: true },
        orderBy: { createdAt: "asc" },
        take: TENANT_SCAN_LIMIT,
      }),
      db().tenant.count({ where: LIVE }),
    ]);
    return { ids: rows.map((row) => row.id), total };
  },

  /**
   * One tenant's AI and storage totals, read from INSIDE that tenant.
   *
   * `systemContextFor` is the least-privileged context in the codebase: it scopes queries and is
   * refused by every capability check, which is what it should be here — the authorization
   * decision was made on the platform axis before this was called, and this context exists only so
   * the seam has a tenant to inject. Both reads share one transaction, so the walk pays one
   * BEGIN/`set_config`/COMMIT per tenant rather than one per query.
   */
  tenantScopedUsage(tenantId: string, since: Date, until: Date): Promise<TenantScopedUsageRow> {
    return withTenantTransaction(systemContextFor(tenantId), async (tx) => {
      const window = { createdAt: { gte: since, lt: until } };
      const [ai, aiErrors, documents] = await Promise.all([
        tx.aiUsageEvent.aggregate({
          where: window,
          _count: { _all: true },
          _sum: { inputTokens: true, outputTokens: true },
        }),
        tx.aiUsageEvent.count({ where: { ...window, status: "error" } }),
        tx.document.aggregate({
          where: { deletedAt: null, createdAt: { lt: until } },
          _count: { _all: true, sizeBytes: true },
          _sum: { sizeBytes: true },
        }),
      ]);
      return {
        aiCalls: ai._count._all,
        aiErrors,
        aiInputTokens: ai._sum.inputTokens ?? 0,
        aiOutputTokens: ai._sum.outputTokens ?? 0,
        documents: documents._count._all,
        documentBytes: documents._sum.sizeBytes ?? 0,
        documentsOfUnknownSize: documents._count._all - documents._count.sizeBytes,
      };
    });
  },
};
