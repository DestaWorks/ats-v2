import type { TenantContext } from "@destaworks/domain/tenant";
import {
  ACTIVE_STATUS_CODES,
  ALL_STATUS_CODES,
  isTerminalStatus,
  statusLabel,
  statusOrder,
  type CandidateStatus,
} from "@destaworks/domain/constants";
import { getDaysInStage } from "@destaworks/domain/rules/stage-timing";
import type {
  ClientCapacityDTO,
  ClientFunnelDTO,
  ClientPortfolioDTO,
  ReportFilters,
} from "@destaworks/contracts/validation/reports";
import { candidateRepository } from "@destaworks/db/repositories/candidate.repository";
import { clientRepository } from "@destaworks/db/repositories/client.repository";
import { openRoleRepository } from "@destaworks/db/repositories/open-role.repository";
import { stageHistoryRepository } from "@destaworks/db/repositories/stage-history.repository";
import { loadCohort, scoreFor } from "./cohort";
import { activeOrderAsOf } from "@destaworks/domain/reports/stage-progress";
import { average } from "@destaworks/domain/reports/metrics";

const MS_PER_WEEK = 7 * 86_400_000;

/** Client Capacity alert thresholds (legacy `index.html:2911-2913`, preserved). */
const CAPACITY_RED = 80;
const CAPACITY_ORANGE = 60;

export const clientReportsService = {
  /**
   * Per-Client Funnel with a REAL week-over-week delta (legacy `index.html:8374-8425` computed a
   * lagged (7d-ago − 14d-ago) delta shown next to a THIRD, current-day count — internally
   * inconsistent. Here: `current` and `weekAgo` are the same two numbers the delta is drawn from.
   */
  async perClientFunnel(ctx: TenantContext, filters: ReportFilters): Promise<ClientFunnelDTO> {
    const now = new Date();
    const weekAgo = new Date(now.getTime() - MS_PER_WEEK);
    const [cohort, historyNow, historyWeekAgo, clients] = await Promise.all([
      loadCohort(ctx, filters),
      stageHistoryRepository.maxStageOrderAsOf(ctx, now),
      stageHistoryRepository.maxStageOrderAsOf(ctx, weekAgo),
      clientRepository.list(ctx),
    ]);

    const byClient = new Map<string, typeof cohort.candidates>();
    for (const c of cohort.candidates) {
      if (!c.clientId) continue;
      const list = byClient.get(c.clientId) ?? [];
      list.push(c);
      byClient.set(c.clientId, list);
    }

    const openRoleGroups = await openRoleRepository.countOpenByClient(ctx, [...byClient.keys()]);
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
  async clientPortfolio(ctx: TenantContext, filters: ReportFilters): Promise<ClientPortfolioDTO> {
    const [cohort, clients] = await Promise.all([
      loadCohort(ctx, filters),
      clientRepository.list(ctx),
    ]);
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
          .map((c) => scoreFor(c, cohort.rulesByClient, now))
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

  /**
   * Client Capacity (originally the standalone `/analytics` KPI view — folded in here 2026-08-03,
   * `docs/MODULE-BREAKDOWN.md` §25). Numerator is **all-time cumulative placements**, never
   * period-filtered (confirmed with Biruh — legacy's period-filtered numerator barely ever fired
   * outside "All Time"), so — unlike every other tab on this page — this method takes no filters
   * and doesn't load a cohort at all. No hardcoded per-client capacity map like legacy's three
   * separate ones; reads the real `Client.capacity` column.
   */
  async clientCapacity(ctx: TenantContext): Promise<ClientCapacityDTO> {
    const clients = await clientRepository.list(ctx);
    const capacityClients = clients.filter((c) => c.capacity !== null && c.capacity > 0);
    const placedGroups = await candidateRepository.countStartedByClient(
      ctx,
      capacityClients.map((c) => c.id),
    );
    const placedByClient = new Map<string, number>();
    for (const g of placedGroups) {
      if (g.clientId) placedByClient.set(g.clientId, g._count._all);
    }
    const clients_ = capacityClients.map((c) => {
      const placed = placedByClient.get(c.id) ?? 0;
      const capacity = c.capacity as number;
      const pct = Math.round((placed / capacity) * 100);
      const tone = pct >= CAPACITY_RED ? "red" : pct >= CAPACITY_ORANGE ? "orange" : "green";
      return {
        clientId: c.id,
        clientName: c.name,
        capacity,
        placed,
        pct,
        tone: tone as "red" | "orange" | "green",
        approachingCapacity: pct >= CAPACITY_RED,
      };
    });
    return { clients: clients_ };
  },
};
