import "server-only";
import {
  ACTIVE_STATUS_CODES,
  statusLabel,
  statusOrder,
  type CandidateStatus,
} from "@/lib/constants";
import { getAutoDisqualify } from "@/lib/rules/disqualify";
import { isOverdue } from "@/lib/rules/stage-timing";
import type {
  ExecutiveSummaryDTO,
  PipelineFunnelDTO,
  ReportFilters,
} from "@/lib/validation/reports";
import { toRuleCandidate } from "@/server/services/candidate.dto";
import { stageHistoryRepository } from "@/server/repositories/stage-history.repository";
import { loadCohort, scoreFor } from "./cohort";
import { activeOrderAsOf } from "@/lib/reports/stage-progress";

/** "In Review" = Initial Screening + Desta Review (legacy exact idx 2-3 — a small explicit set,
 *  safe from the STATUSES.indexOf "reached-or-beyond" bug since it's equality, not >=). */
const IN_REVIEW: readonly CandidateStatus[] = ["INITIAL_SCREENING", "DESTA_REVIEW"];
/** "At Client" = Submitted to Client + Client Interview (legacy exact idx 4-5). */
const AT_CLIENT: readonly CandidateStatus[] = ["SUBMITTED_TO_CLIENT", "CLIENT_INTERVIEW"];
const TOP_CANDIDATES_LIMIT = 10;

export const pipelineReportsService = {
  /** Executive Summary — the top-level pipeline snapshot (legacy `index.html:8228-8265`). */
  async executiveSummary(filters: ReportFilters): Promise<ExecutiveSummaryDTO> {
    const cohort = await loadCohort(filters);
    const now = new Date();
    const total = cohort.candidates.length;

    let placed = 0;
    let inReview = 0;
    let atClient = 0;
    let overdue = 0;
    let flagged = 0;
    const countByStatus = new Map<CandidateStatus, number>();

    for (const c of cohort.candidates) {
      const status = c.status as CandidateStatus;
      countByStatus.set(status, (countByStatus.get(status) ?? 0) + 1);
      if (status === "STARTED_DAY1") placed++;
      if (IN_REVIEW.includes(status)) inReview++;
      if (AT_CLIENT.includes(status)) atClient++;
      if (isOverdue(status, c.stageEnteredAt, now)) overdue++;
      const rules = c.clientId ? cohort.rulesByClient.get(c.clientId) : undefined;
      const dq = getAutoDisqualify(toRuleCandidate(c), rules ?? null);
      if (c.licenseStatus === "Expired" || dq.length > 0) flagged++;
    }

    const distribution = ACTIVE_STATUS_CODES.map((status) => {
      const count = countByStatus.get(status) ?? 0;
      return {
        status,
        label: statusLabel(status),
        count,
        pct: total > 0 ? (count / total) * 100 : 0,
      };
    });

    const topCandidates = cohort.candidates
      .map((c) => ({
        id: c.id,
        name: c.name,
        clientName: c.clientId ? (cohort.clientNames.get(c.clientId) ?? null) : null,
        scorePct: scoreFor(c, cohort.rulesByClient),
      }))
      .filter((c): c is typeof c & { scorePct: number } => c.scorePct !== null)
      .sort((a, b) => b.scorePct - a.scorePct)
      .slice(0, TOP_CANDIDATES_LIMIT);

    return { total, placed, inReview, atClient, overdue, flagged, distribution, topCandidates };
  },

  /**
   * Pipeline Funnel — "reached this active stage or beyond" per stage (legacy `index.html:8427-
   * 8450`). Uses `stageHistoryRepository.maxStageOrderAsOf` (real history), NOT current-status
   * order — the fix for legacy's `STATUSES.indexOf` bug that silently counted rejected candidates
   * as having "reached" every earlier stage, including Placed.
   */
  async pipelineFunnel(filters: ReportFilters): Promise<PipelineFunnelDTO> {
    const now = new Date();
    const [cohort, historyMax] = await Promise.all([
      loadCohort(filters),
      stageHistoryRepository.maxStageOrderAsOf(now),
    ]);

    const reachedCounts = ACTIVE_STATUS_CODES.map((status) => {
      const threshold = statusOrder(status);
      const count = cohort.candidates.filter(
        (c) => activeOrderAsOf(c, historyMax, c.id, now) >= threshold,
      ).length;
      return { status, count };
    });

    const stages = reachedCounts.map((r, i) => {
      const prev = i > 0 ? reachedCounts[i - 1] : undefined;
      return {
        status: r.status,
        label: statusLabel(r.status),
        reachedCount: r.count,
        conversionPct: !prev || prev.count === 0 ? null : (r.count / prev.count) * 100,
      };
    });

    return { stages };
  },
};
