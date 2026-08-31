import type { TenantContext } from "@destaworks/domain/tenant";
import {
  SOURCES,
  isTerminalStatus,
  statusOrder,
  type CandidateStatus,
} from "@destaworks/domain/constants";
import { getDaysInStage } from "@destaworks/domain/rules/stage-timing";
import type {
  ReportFilters,
  SourceRoiDTO,
  TeamPerformanceDTO,
} from "@destaworks/contracts/validation/reports";
import { stageHistoryRepository } from "@destaworks/db/repositories/stage-history.repository";
import { userRepository } from "@destaworks/db/repositories/user.repository";
import { loadCohort } from "./cohort";
import { activeOrderAsOf } from "@destaworks/domain/reports/stage-progress";
import { average } from "@destaworks/domain/reports/metrics";

const SCREENING_THRESHOLD = statusOrder("INITIAL_SCREENING");
const SUBMITTED_THRESHOLD = statusOrder("SUBMITTED_TO_CLIENT");

export const teamReportsService = {
  /** Team Performance — per-associate rollup (legacy `index.html:8452-8530`). */
  async teamPerformance(ctx: TenantContext, filters: ReportFilters): Promise<TeamPerformanceDTO> {
    const now = new Date();
    const [cohort, historyMax, users] = await Promise.all([
      loadCohort(ctx, filters),
      stageHistoryRepository.maxStageOrderAsOf(ctx, now),
      userRepository.listByTenant(ctx.tenantId),
    ]);

    const byUser = new Map<string, typeof cohort.candidates>();
    for (const c of cohort.candidates) {
      if (!c.createdById) continue;
      const list = byUser.get(c.createdById) ?? [];
      list.push(c);
      byUser.set(c.createdById, list);
    }

    const rows = users
      .filter((u) => byUser.has(u.id))
      .map((u) => {
        const rows_ = byUser.get(u.id) ?? [];
        const added = rows_.length;
        const screening = rows_.filter(
          (c) => activeOrderAsOf(c, historyMax, c.id, now) >= SCREENING_THRESHOLD,
        ).length;
        const submitted = rows_.filter(
          (c) => activeOrderAsOf(c, historyMax, c.id, now) >= SUBMITTED_THRESHOLD,
        ).length;
        const placed = rows_.filter((c) => c.status === "STARTED_DAY1").length;
        const activeDays = rows_
          .filter((c) => !isTerminalStatus(c.status as CandidateStatus))
          .map((c) => getDaysInStage(c.stageEnteredAt, now));
        return {
          userId: u.id,
          name: u.name,
          added,
          screening,
          submitted,
          placed,
          avgDaysInStage: average(activeDays),
          conversionPct: added > 0 ? (placed / added) * 100 : null,
        };
      });

    return { rows };
  },

  /** Source ROI — per-source funnel (legacy `index.html:8532-8571`). */
  async sourceRoi(ctx: TenantContext, filters: ReportFilters): Promise<SourceRoiDTO> {
    const now = new Date();
    const [cohort, historyMax] = await Promise.all([
      loadCohort(ctx, filters),
      stageHistoryRepository.maxStageOrderAsOf(ctx, now),
    ]);

    const bySource = new Map<string, typeof cohort.candidates>();
    for (const c of cohort.candidates) {
      const key = c.source ?? "Unknown";
      const list = bySource.get(key) ?? [];
      list.push(c);
      bySource.set(key, list);
    }

    // Canonical sources first (in their fixed order), then any non-canonical value actually
    // present in the data (free-text imports/ETL can carry a source outside the SOURCES vocab).
    const extraSources = [...bySource.keys()].filter(
      (s) => !(SOURCES as readonly string[]).includes(s),
    );
    const sourceKeys = [...SOURCES, ...extraSources];

    const rows = sourceKeys
      .filter((source) => bySource.has(source))
      .map((source) => {
        const rows_ = bySource.get(source) ?? [];
        const total = rows_.length;
        const screening = rows_.filter(
          (c) => activeOrderAsOf(c, historyMax, c.id, now) >= SCREENING_THRESHOLD,
        ).length;
        const submitted = rows_.filter(
          (c) => activeOrderAsOf(c, historyMax, c.id, now) >= SUBMITTED_THRESHOLD,
        ).length;
        const placed = rows_.filter((c) => c.status === "STARTED_DAY1").length;
        return {
          source,
          total,
          screening,
          submitted,
          placed,
          conversionPct: total > 0 ? (placed / total) * 100 : null,
        };
      });

    return { rows };
  },
};
