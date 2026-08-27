import "server-only";
import { statusLabel, type CandidateStatus } from "@destaworks/domain/constants";
import { median, percentile, timeToFillDays } from "@destaworks/domain/reports/metrics";
import type {
  JourneySegmentDTO,
  MassJourneyDTO,
  ReportFilters,
} from "@destaworks/contracts/validation/reports";
import {
  stageHistoryRepository,
  type StageHistoryRow,
} from "@destaworks/db/repositories/stage-history.repository";
import { loadCohort } from "./cohort";

/** Rendered Gantt rows are capped — the computation (median/p90/bottleneck) still runs over the
 *  FULL filtered cohort (legacy parity); only the visual rows are bounded, and the UI is told the
 *  true total so the cap is never silent. */
const MASS_JOURNEY_ROW_CAP = 50;
/** Window floor/ceiling in days (legacy: at least 30 days visible, never more than 180). */
const MIN_WINDOW_DAYS = 30;
const MAX_WINDOW_DAYS = 180;
const MS_PER_DAY = 86_400_000;

interface Segment {
  status: CandidateStatus;
  start: Date;
  end: Date;
}

/** One candidate's full stage journey: an implicit New-Candidate segment from `createdAt` to the
 *  first history row (if any), then one segment per subsequent transition, to `now`. */
function buildSegments(createdAt: Date, history: StageHistoryRow[], now: Date): Segment[] {
  const segments: Segment[] = [];
  let cursor = createdAt;
  let cursorStatus: CandidateStatus = "NEW_CANDIDATE";
  for (const row of history) {
    segments.push({ status: cursorStatus, start: cursor, end: row.enteredAt });
    cursor = row.enteredAt;
    cursorStatus = row.toStatus as CandidateStatus;
  }
  segments.push({ status: cursorStatus, start: cursor, end: now });
  return segments;
}

export const massJourneyReport = {
  /** Mass Journey Gantt (legacy `index.html:8267-8372`, the peak-complexity module). */
  async massJourney(filters: ReportFilters): Promise<MassJourneyDTO> {
    const now = new Date();
    const cohort = await loadCohort(filters);
    const history = await stageHistoryRepository.listByCandidateIds(
      cohort.candidates.map((c) => c.id),
    );

    const historyByCandidate = new Map<string, StageHistoryRow[]>();
    for (const row of history) {
      const list = historyByCandidate.get(row.candidateId) ?? [];
      list.push(row);
      historyByCandidate.set(row.candidateId, list);
    }

    // Window: earliest createdAt in the cohort, clamped to [30, 180] days back from now.
    const earliest = cohort.candidates.reduce<Date | null>(
      (min, c) => (min === null || c.createdAt < min ? c.createdAt : min),
      null,
    );
    const daysSinceEarliest = earliest
      ? Math.ceil((now.getTime() - earliest.getTime()) / MS_PER_DAY)
      : MIN_WINDOW_DAYS;
    const windowDays = Math.min(Math.max(daysSinceEarliest, MIN_WINDOW_DAYS), MAX_WINDOW_DAYS);
    const windowStart = new Date(now.getTime() - windowDays * MS_PER_DAY);

    // Median/p90 time-to-place + bottleneck stages — over the FULL cohort, not just visible rows.
    const ttp = cohort.candidates
      .map((c) => timeToFillDays(c))
      .filter((d): d is number => d !== null);
    const closedDaysByStatus = new Map<CandidateStatus, number[]>();
    for (const c of cohort.candidates) {
      const segments = buildSegments(c.createdAt, historyByCandidate.get(c.id) ?? [], now);
      for (const seg of segments.slice(0, -1)) {
        // all but the final (still-open) segment
        const days = (seg.end.getTime() - seg.start.getTime()) / MS_PER_DAY;
        const list = closedDaysByStatus.get(seg.status) ?? [];
        list.push(days);
        closedDaysByStatus.set(seg.status, list);
      }
    }
    const bottleneckStages = [...closedDaysByStatus.entries()]
      .map(([status, days]) => ({
        status,
        label: statusLabel(status),
        medianDays: median(days) ?? 0,
      }))
      .sort((a, b) => b.medianDays - a.medianDays)
      .slice(0, 5);

    // Visible rows: most-recently-active first (proxy: latest stageEnteredAt), capped.
    const visible = [...cohort.candidates]
      .sort((a, b) => b.stageEnteredAt.getTime() - a.stageEnteredAt.getTime())
      .slice(0, MASS_JOURNEY_ROW_CAP);

    const rows = visible.map((c) => {
      const segments = buildSegments(c.createdAt, historyByCandidate.get(c.id) ?? [], now);
      const dtoSegments: JourneySegmentDTO[] = segments.map((seg) => {
        const clampedStart = seg.start < windowStart ? windowStart : seg.start;
        const startDay = Math.max(
          0,
          Math.round((clampedStart.getTime() - windowStart.getTime()) / MS_PER_DAY),
        );
        const days = Math.max(
          1,
          Math.round((seg.end.getTime() - clampedStart.getTime()) / MS_PER_DAY),
        );
        return { status: seg.status, label: statusLabel(seg.status), startDay, days };
      });
      return {
        candidateId: c.id,
        name: c.name,
        clientName: c.clientId ? (cohort.clientNames.get(c.clientId) ?? null) : null,
        segments: dtoSegments,
      };
    });

    return {
      windowStart: windowStart.toISOString().slice(0, 10),
      windowEnd: now.toISOString().slice(0, 10),
      totalCandidates: cohort.candidates.length,
      shownCount: rows.length,
      medianDaysToPlace: median(ttp),
      p90DaysToPlace: percentile(ttp, 90),
      bottleneckStages,
      rows,
    };
  },
};
