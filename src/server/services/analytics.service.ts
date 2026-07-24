import "server-only";
import { ALL_STATUS_CODES, statusLabel } from "@/lib/constants";
import { average, median, timeToFillDays } from "@/lib/reports/metrics";
import type { AnalyticsDTO, AnalyticsFilters } from "@/lib/validation/reports";
import { candidateRepository } from "@/server/repositories/candidate.repository";
import { clientRepository } from "@/server/repositories/client.repository";
import { loadCohort } from "./reports/cohort";

/** Client Capacity alert thresholds (legacy `index.html:2911-2913`, preserved). */
const CAPACITY_RED = 80;
const CAPACITY_ORANGE = 60;

/**
 * The `viewAnalytics`-gated KPI view (legacy `vw="kpi"`, `index.html:2827-2916` — MODULE-BREAKDOWN
 * §25 explicitly folds this into Reports EXCEPT Client Capacity, which must be preserved). Time-
 * to-Fill and Source-of-Hire call the SAME helpers/definition `time-reports.service.ts` uses —
 * legacy computed each twice, slightly differently, and disagreed with itself.
 */
export const analyticsService = {
  async overview(filters: AnalyticsFilters): Promise<AnalyticsDTO> {
    const cohort = await loadCohort(filters);
    const total = cohort.candidates.length;

    const statusCounts = new Map<string, number>();
    const clientCounts = new Map<string, number>();
    const sourceCounts = new Map<string, number>();
    for (const c of cohort.candidates) {
      statusCounts.set(c.status, (statusCounts.get(c.status) ?? 0) + 1);
      const clientName = c.clientId
        ? (cohort.clientNames.get(c.clientId) ?? "Unknown")
        : "Unassigned";
      clientCounts.set(clientName, (clientCounts.get(clientName) ?? 0) + 1);
      const source = c.source ?? "Unknown";
      sourceCounts.set(source, (sourceCounts.get(source) ?? 0) + 1);
    }
    const pct = (n: number) => (total > 0 ? (n / total) * 100 : 0);

    const byStatus = ALL_STATUS_CODES.filter((s) => (statusCounts.get(s) ?? 0) > 0).map(
      (status) => ({
        status,
        label: statusLabel(status),
        count: statusCounts.get(status) ?? 0,
        pct: pct(statusCounts.get(status) ?? 0),
      }),
    );
    const byClient = [...clientCounts.entries()]
      .map(([clientName, count]) => ({ clientName, count, pct: pct(count) }))
      .sort((a, b) => b.count - a.count);
    const bySource = [...sourceCounts.entries()]
      .map(([source, count]) => ({ source, count, pct: pct(count) }))
      .sort((a, b) => b.count - a.count);

    const ttf = cohort.candidates
      .map((c) => timeToFillDays(c))
      .filter((d): d is number => d !== null);

    const sourceOfHireMap = new Map<string, { total: number; placed: number }>();
    for (const c of cohort.candidates) {
      const source = c.source ?? "Unknown";
      const bucket = sourceOfHireMap.get(source) ?? { total: 0, placed: 0 };
      bucket.total++;
      if (c.status === "STARTED_DAY1") bucket.placed++;
      sourceOfHireMap.set(source, bucket);
    }
    const sourceOfHire = [...sourceOfHireMap.entries()].map(([source, b]) => ({
      source,
      total: b.total,
      placed: b.placed,
      conversionPct: b.total > 0 ? (b.placed / b.total) * 100 : null,
    }));

    const clients = await clientRepository.list();
    const capacityRows = await Promise.all(
      clients
        .filter((c) => c.capacity !== null && c.capacity > 0)
        .map(async (c) => {
          const placed = await candidateRepository.count({
            clientId: c.id,
            status: "STARTED_DAY1",
          });
          const capacity = c.capacity as number;
          const capPct = Math.round((placed / capacity) * 100);
          const tone =
            capPct >= CAPACITY_RED ? "red" : capPct >= CAPACITY_ORANGE ? "orange" : "green";
          return {
            clientId: c.id,
            clientName: c.name,
            capacity,
            placed,
            pct: capPct,
            tone: tone as "red" | "orange" | "green",
            approachingCapacity: capPct >= CAPACITY_RED,
          };
        }),
    );

    return {
      total,
      byStatus,
      byClient,
      bySource,
      timeToFill: { avgDays: average(ttf), medianDays: median(ttf), count: ttf.length },
      sourceOfHire,
      clientCapacity: capacityRows,
    };
  },
};
