import "server-only";
import {
  ACTIVE_STATUS_CODES,
  ALL_STATUS_CODES,
  isTerminalStatus,
  statusLabel,
  statusOrder,
  type CandidateStatus,
} from "@/lib/constants";
import { getDaysInStage } from "@/lib/rules/stage-timing";
import type { ClientFunnelDTO, ClientPortfolioDTO, ReportFilters } from "@/lib/validation/reports";
import { clientRepository } from "@/server/repositories/client.repository";
import { openRoleRepository } from "@/server/repositories/open-role.repository";
import { stageHistoryRepository } from "@/server/repositories/stage-history.repository";
import { loadCohort, scoreFor } from "./cohort";
import { activeOrderAsOf } from "@/lib/reports/stage-progress";
import { average } from "@/lib/reports/metrics";

const MS_PER_WEEK = 7 * 86_400_000;

export const clientReportsService = {
  /**
   * Per-Client Funnel with a REAL week-over-week delta (legacy `index.html:8374-8425` computed a
   * lagged (7d-ago − 14d-ago) delta shown next to a THIRD, current-day count — internally
   * inconsistent. Here: `current` and `weekAgo` are the same two numbers the delta is drawn from.
   */
  async perClientFunnel(filters: ReportFilters): Promise<ClientFunnelDTO> {
    const now = new Date();
    const weekAgo = new Date(now.getTime() - MS_PER_WEEK);
    const [cohort, historyNow, historyWeekAgo, clients] = await Promise.all([
      loadCohort(filters),
      stageHistoryRepository.maxStageOrderAsOf(now),
      stageHistoryRepository.maxStageOrderAsOf(weekAgo),
      clientRepository.list(),
    ]);

    const byClient = new Map<string, typeof cohort.candidates>();
    for (const c of cohort.candidates) {
      if (!c.clientId) continue;
      const list = byClient.get(c.clientId) ?? [];
      list.push(c);
      byClient.set(c.clientId, list);
    }

    const openRoleGroups = await openRoleRepository.countOpenByClient([...byClient.keys()]);
    const openRolesByClient = new Map(openRoleGroups.map((r) => [r.clientId, r._count._all]));

    const clients_ = clients
      .filter((client) => byClient.has(client.id))
      .map((client) => {
        const rows = byClient.get(client.id) ?? [];
        const stages = ACTIVE_STATUS_CODES.map((status) => {
          const threshold = statusOrder(status);
          const current = rows.filter(
            (c) => activeOrderAsOf(c, historyNow, c.id, now) >= threshold,
          ).length;
          const weekAgoCount = rows.filter(
            (c) => activeOrderAsOf(c, historyWeekAgo, c.id, weekAgo) >= threshold,
          ).length;
          return {
            status,
            label: statusLabel(status),
            current,
            weekAgo: weekAgoCount,
            delta: current - weekAgoCount,
          };
        });
        return {
          clientId: client.id,
          clientName: client.name,
          stages,
          openRoles: openRolesByClient.get(client.id) ?? 0,
        };
      });

    return { clients: clients_ };
  },

  /** Client Portfolio — per-client snapshot + avg fit score (legacy `index.html:8573-8609`). */
  async clientPortfolio(filters: ReportFilters): Promise<ClientPortfolioDTO> {
    const [cohort, clients] = await Promise.all([loadCohort(filters), clientRepository.list()]);
    const now = new Date();

    const byClient = new Map<string, typeof cohort.candidates>();
    for (const c of cohort.candidates) {
      if (!c.clientId) continue;
      const list = byClient.get(c.clientId) ?? [];
      list.push(c);
      byClient.set(c.clientId, list);
    }

    const clients_ = clients
      .filter((client) => byClient.has(client.id))
      .map((client) => {
        const rows = byClient.get(client.id) ?? [];
        const placed = rows.filter((c) => c.status === "STARTED_DAY1").length;
        const inPipeline = rows.filter(
          (c) => !isTerminalStatus(c.status as CandidateStatus),
        ).length;
        const scores = rows
          .map((c) => scoreFor(c, cohort.rulesByClient))
          .filter((s): s is number => s !== null);
        const activeDays = rows
          .filter((c) => !isTerminalStatus(c.status as CandidateStatus))
          .map((c) => getDaysInStage(c.stageEnteredAt, now));

        const countByStatus = new Map<string, number>();
        for (const c of rows) countByStatus.set(c.status, (countByStatus.get(c.status) ?? 0) + 1);
        const byStatus = ALL_STATUS_CODES.filter((s) => (countByStatus.get(s) ?? 0) > 0).map(
          (status) => ({
            status,
            label: statusLabel(status),
            count: countByStatus.get(status) ?? 0,
          }),
        );

        return {
          clientId: client.id,
          clientName: client.name,
          priority: client.priority,
          placed,
          inPipeline,
          avgScorePct: average(scores),
          avgDaysInStage: average(activeDays),
          byStatus,
        };
      });

    return { clients: clients_ };
  },
};
