import { dateKey, daysBefore } from "@destaworks/domain/daily";
import type {
  TrendsAnomalyDTO,
  TrendsDTO,
  TrendsFunnelStageDTO,
  TrendsMetricDTO,
} from "@destaworks/contracts/validation/reports";
import { dailyRepository, type InstantWindow } from "@destaworks/db/repositories/daily.repository";
import { stageHistoryRepository } from "@destaworks/db/repositories/stage-history.repository";

/**
 * Trends (Wave 5.2 "heaviest report" flex item, legacy `index.html:6379-6557`, the Weekly Brief's
 * "DROP 50" block — Anomalies + 5-stage Funnel + rolling Week/Month/Quarter trends). Deliberately
 * NOT filtered by the `/reports` universal filter bar (legacy's version lives on the Weekly Brief
 * page, unfiltered/team-wide — same scope as `briefService`'s week totals).
 *
 * Every metric reuses the ALREADY-FIXED Wave 5.1 primitives (`dailyRepository`'s range-groupBys +
 * `stageHistoryRepository.enteredStatusCountsByRange`) instead of legacy's per-metric bugs:
 * - "Promoted" used candidate `Tags` text-matching in legacy (one of TWO divergent definitions
 *   across the app) — here it's the same canonical audit-trail count Wave 5.1 already built.
 * - "Submitted"/"Hires" used `Status === X && UpdatedAt in range` in legacy — `UpdatedAt` is a
 *   generic last-write timestamp any unrelated edit resets. Here they're FLOW counts (candidates
 *   that ENTERED that status within the window, from real `stage_history`), not a status-now
 *   snapshot filtered by a mistimed field.
 */

const MS_PER_DAY = 86_400_000;
const WEEK_MS = 7 * MS_PER_DAY;
const MONTH_MS = 30 * MS_PER_DAY;
const QUARTER_MS = 90 * MS_PER_DAY;

/** No app-wide settings mechanism exists yet — legacy's `WeeklyPlacementGoal` setting (default 4). */
const DEFAULT_WEEKLY_PLACEMENT_GOAL = 4;
/** Anomaly noise floor + threshold (legacy: skip if both sides < 5; flag at >=30% WoW). */
const ANOMALY_MIN_VOLUME = 5;
const ANOMALY_NEW_THRESHOLD = 10;
const ANOMALY_PCT_THRESHOLD = 30;

function window(msBack: number, msBackEnd = 0): InstantWindow {
  const now = Date.now();
  return { start: new Date(now - msBack), end: new Date(now - msBackEnd) };
}

interface MetricTotals {
  sourced: number;
  outreach: number;
  responses: number;
  promoted: number;
  submitted: number;
  hires: number;
}

async function metricTotals(w: InstantWindow): Promise<MetricTotals> {
  const [sourced, outreach, responses, promoted, submitted, hires] = await Promise.all([
    dailyRepository.sourcedCountsByRange(w),
    dailyRepository.outreachCountsByRange(w),
    dailyRepository.responseCountsByRange(w),
    dailyRepository.promotedCountsByRange(w),
    stageHistoryRepository.enteredStatusCountsByRange("SUBMITTED_TO_CLIENT", w),
    stageHistoryRepository.enteredStatusCountsByRange("STARTED_DAY1", w),
  ]);
  const sum = (m: Map<string, number>) => [...m.values()].reduce((a, b) => a + b, 0);
  return {
    sourced: sum(sourced),
    outreach: sum(outreach),
    responses: sum(responses),
    promoted: sum(promoted),
    submitted: sum(submitted),
    hires: sum(hires),
  };
}

function convPct(a: number, b: number): number | null {
  return b > 0 ? Math.round((a / b) * 100) : null;
}

export const trendsReport = {
  async trends(): Promise<TrendsDTO> {
    const [thisWeek, lastWeek, thisMonth, lastMonth, thisQuarter, lastQuarter, weekTargets] =
      await Promise.all([
        metricTotals(window(WEEK_MS)),
        metricTotals(window(2 * WEEK_MS, WEEK_MS)),
        metricTotals(window(MONTH_MS)),
        metricTotals(window(2 * MONTH_MS, MONTH_MS)),
        metricTotals(window(QUARTER_MS)),
        metricTotals(window(2 * QUARTER_MS, QUARTER_MS)),
        dailyRepository.targetsForDateRange(
          Array.from({ length: 7 }, (_, i) => daysBefore(dateKey(), i)),
        ),
      ]);

    const sourcingGoal = weekTargets.reduce((s, t) => s + t.sourcing, 0);
    const outreachGoal = weekTargets.reduce((s, t) => s + t.outreach, 0);

    const metrics: TrendsMetricDTO[] = [
      { key: "sourced", label: "Sourced", goal: sourcingGoal },
      { key: "outreach", label: "Outreach", goal: outreachGoal },
      { key: "responses", label: "Responses", goal: null },
      { key: "promoted", label: "Promoted", goal: null },
      { key: "submitted", label: "Submitted", goal: null },
      { key: "hires", label: "Hires", goal: DEFAULT_WEEKLY_PLACEMENT_GOAL },
    ].map(({ key, label, goal }) => ({
      key: key as TrendsMetricDTO["key"],
      label,
      thisWeek: thisWeek[key as keyof MetricTotals],
      lastWeek: lastWeek[key as keyof MetricTotals],
      thisMonth: thisMonth[key as keyof MetricTotals],
      lastMonth: lastMonth[key as keyof MetricTotals],
      thisQuarter: thisQuarter[key as keyof MetricTotals],
      lastQuarter: lastQuarter[key as keyof MetricTotals],
      goal,
    }));

    const anomalies: TrendsAnomalyDTO[] = metrics
      .filter((m) => {
        if (m.lastWeek < ANOMALY_MIN_VOLUME && m.thisWeek < ANOMALY_MIN_VOLUME) return false;
        if (m.lastWeek === 0) return m.thisWeek >= ANOMALY_NEW_THRESHOLD;
        const pct = ((m.thisWeek - m.lastWeek) / m.lastWeek) * 100;
        return Math.abs(pct) >= ANOMALY_PCT_THRESHOLD;
      })
      .map((m) => ({
        label: m.label,
        thisWeek: m.thisWeek,
        lastWeek: m.lastWeek,
        direction: m.thisWeek >= m.lastWeek ? "up" : "down",
        changeLabel:
          m.lastWeek === 0
            ? "new"
            : `${Math.round(((m.thisWeek - m.lastWeek) / m.lastWeek) * 100)}%`,
      }));

    // 5-stage funnel (Sourced → Outreach → Responses → Submitted → Hires) — Promoted is
    // deliberately excluded, matching legacy's own funnel shape.
    const funnelKeys: TrendsMetricDTO["key"][] = [
      "sourced",
      "outreach",
      "responses",
      "submitted",
      "hires",
    ];
    const metricByKey = new Map(metrics.map((m) => [m.key, m]));
    const funnel: TrendsFunnelStageDTO[] = funnelKeys.flatMap((key, i) => {
      const m = metricByKey.get(key);
      if (!m) return [];
      const prevKey = i > 0 ? funnelKeys[i - 1] : null;
      const prevMetric = prevKey ? (metricByKey.get(prevKey) ?? null) : null;
      return [
        {
          label: m.label,
          curr: m.thisWeek,
          prev: m.lastWeek,
          convCurrPct: prevMetric ? convPct(m.thisWeek, prevMetric.thisWeek) : null,
          convPrevPct: prevMetric ? convPct(m.lastWeek, prevMetric.lastWeek) : null,
        },
      ];
    });

    return { metrics, anomalies, funnel };
  },
};
