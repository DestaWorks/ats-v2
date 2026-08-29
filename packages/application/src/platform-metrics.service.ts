import { logger } from "@destaworks/config/logger";
import {
  platformMetricsRepository,
  type TenantScopedUsageRow,
} from "@destaworks/db/tenancy/platform-metrics.repository";
import { hasPlatformCapability } from "@destaworks/domain/platform";
import { MS_PER_DAY, systemClock, type Clock } from "@destaworks/domain/clock";
import { utcDayStart } from "@destaworks/domain/daily";
import type { AuthUser } from "@destaworks/auth/guards";
import { requirePlatformCapability } from "@destaworks/auth/platform-admin";
import type {
  GetPlatformMetricsResponse,
  PlatformAiUsageDTO,
  PlatformMetricsQuery,
  PlatformSignupPointDTO,
  PlatformStorageDTO,
} from "@destaworks/contracts/validation/platform-metrics";

/**
 * The installation-wide view (SAAS-RESTRUCTURE-PLAN 6.8 / Phase 8).
 *
 * ── Separate from `reports/*`, by construction rather than by convention ──────────────────────
 *
 * Phase 8 asks for platform metrics "separate from any tenant's reports". This service shares no
 * code path with the report services: it imports nothing from `reports/`, takes no
 * `ReportFilters`, holds no `TenantContext`, and reaches a repository that no report can reach.
 * The separation is enforced by the type system rather than by care — a report service cannot call
 * anything here without first producing a `PlatformContext`, and only deployment configuration
 * mints one; this service cannot answer a pipeline question because it never holds a tenant to ask
 * it about.
 *
 * ── Two capabilities, because two different things happen ────────────────────────────────────
 *
 * `viewTenants` gates the endpoint. Everything read on the strength of it comes from the global
 * tables — how many workspaces exist, what they are paying for, how many seats are in use, whether
 * the job scheduler is ticking. None of it is any tenant's data.
 *
 * The AI and storage totals are different: they are computed by reading inside every tenant, which
 * is precisely what `readTenantData` is described as permitting — "the one capability that crosses
 * the isolation boundary". A caller without it gets `null` for those two sections rather than
 * zeroes, because a zero and a refusal must not look alike to whoever reads the dashboard.
 *
 * ── Why this is not audited into each tenant, and what that costs ────────────────────────────
 *
 * 6.8's rule is that every cross-tenant ACTION is audited into the tenant it touched, and
 * `platformAdminService.readTenant` does exactly that. This read is a different shape: it names no
 * tenant on the way in and attributes nothing to one on the way out, and auditing it faithfully
 * would mean one `activity_log` insert per tenant per dashboard load — a bulk write loop that
 * would bury each customer's real audit trail under refreshes of a page about somebody else. So
 * the crossing is logged (actor id and shape only, never PII) and not written into tenants. A
 * platform-scoped audit sink would be the right home for it and does not exist; adding one is a
 * schema change, and the schema is frozen. Flagged rather than decided here.
 */

/** Sum the per-tenant rows into one installation total. */
function accumulate(rows: readonly TenantScopedUsageRow[]): TenantScopedUsageRow {
  return rows.reduce<TenantScopedUsageRow>(
    (total, row) => ({
      aiCalls: total.aiCalls + row.aiCalls,
      aiErrors: total.aiErrors + row.aiErrors,
      aiInputTokens: total.aiInputTokens + row.aiInputTokens,
      aiOutputTokens: total.aiOutputTokens + row.aiOutputTokens,
      documents: total.documents + row.documents,
      documentBytes: total.documentBytes + row.documentBytes,
      documentsOfUnknownSize: total.documentsOfUnknownSize + row.documentsOfUnknownSize,
    }),
    {
      aiCalls: 0,
      aiErrors: 0,
      aiInputTokens: 0,
      aiOutputTokens: 0,
      documents: 0,
      documentBytes: 0,
      documentsOfUnknownSize: 0,
    },
  );
}

/** `YYYY-MM-DD` for a UTC instant — the key the signup series is bucketed on. */
function dayKey(instant: Date): string {
  return utcDayStart(instant).toISOString().slice(0, 10);
}

/**
 * Every day in the window, zeroes included.
 *
 * A sparse series would let a reader mistake "no signups that day" for "no data that day", and a
 * chart drawn from it would silently compress quiet weeks.
 */
function signupSeries(
  instants: readonly Date[],
  since: Date,
  days: number,
): PlatformSignupPointDTO[] {
  const counts = new Map<string, number>();
  for (const instant of instants) {
    const key = dayKey(instant);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const start = utcDayStart(since).getTime();
  return Array.from({ length: days }, (_unused, offset) => {
    const key = dayKey(new Date(start + offset * MS_PER_DAY));
    return { day: key, tenants: counts.get(key) ?? 0 };
  });
}

function toAiUsage(totals: TenantScopedUsageRow): PlatformAiUsageDTO {
  return {
    calls: totals.aiCalls,
    errors: totals.aiErrors,
    inputTokens: totals.aiInputTokens,
    outputTokens: totals.aiOutputTokens,
  };
}

function toStorage(totals: TenantScopedUsageRow): PlatformStorageDTO {
  return {
    documents: totals.documents,
    knownBytes: totals.documentBytes,
    documentsOfUnknownSize: totals.documentsOfUnknownSize,
  };
}

export const platformMetricsService = {
  /**
   * The whole installation view, in one read.
   *
   * The global sections are fetched concurrently because they are independent. The per-tenant walk
   * is deliberately SEQUENTIAL: each iteration opens its own transaction, and firing all of them
   * at once would exhaust a connection pool sized for ordinary request traffic long before it
   * returned an answer any faster.
   */
  async readMetrics(
    user: AuthUser,
    query: PlatformMetricsQuery,
    clock: Clock = systemClock,
  ): Promise<GetPlatformMetricsResponse> {
    const platform = requirePlatformCapability(user, "viewTenants");

    const until = clock.now();
    const since = new Date(until.getTime() - query.days * MS_PER_DAY);

    const [tenants, seats, signupInstants, activeTenants, schedules] = await Promise.all([
      platformMetricsRepository.tenantCounts(),
      platformMetricsRepository.seatTotals(),
      platformMetricsRepository.signupInstants(since, until),
      platformMetricsRepository.activeTenantCount(until),
      platformMetricsRepository.scheduleHealth(since, until),
    ]);

    const mayReadInside = hasPlatformCapability(platform, "readTenantData");
    const scan = mayReadInside
      ? await platformMetricsRepository.tenantsToScan()
      : { ids: [], total: tenants.total };

    const perTenant: TenantScopedUsageRow[] = [];
    for (const tenantId of scan.ids) {
      perTenant.push(await platformMetricsRepository.tenantScopedUsage(tenantId, since, until));
    }
    const totals = accumulate(perTenant);

    logger.info("platform.metrics.read", {
      actor: platform.user.id,
      days: query.days,
      tenantsScanned: scan.ids.length,
      readInside: mayReadInside,
    });

    return {
      metrics: {
        window: { since: since.toISOString(), until: until.toISOString(), days: query.days },
        tenants,
        seats,
        signups: signupSeries(signupInstants, since, query.days),
        activity: { activeTenants, liveTenants: tenants.total },
        jobs: {
          runsInWindow: schedules.reduce((sum, row) => sum + row.runs, 0),
          schedules: schedules.map((row) => ({
            schedule: row.schedule,
            runs: row.runs,
            lastOccurrenceAt: row.lastOccurrenceAt?.toISOString() ?? null,
          })),
        },
        aiUsage: mayReadInside ? toAiUsage(totals) : null,
        storage: mayReadInside ? toStorage(totals) : null,
        coverage: {
          tenantsScanned: scan.ids.length,
          tenantsTotal: scan.total,
          truncated: scan.ids.length < scan.total,
        },
      },
    };
  },
};
