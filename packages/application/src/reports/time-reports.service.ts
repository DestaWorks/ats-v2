import "server-only";
import { systemClock, type Clock } from "@destaworks/domain/clock";
import {
  ACTION_LICENSE_STATUSES,
  ACTIVE_STATUS_CODES,
  statusLabel,
  statusSlaDays,
} from "@destaworks/domain/constants";
import { getAutoDisqualify } from "@destaworks/domain/rules/disqualify";
import { getDaysInStage } from "@destaworks/domain/rules/stage-timing";
import type {
  ComplianceDTO,
  ReportFilters,
  TimeAnalysisDTO,
} from "@destaworks/contracts/validation/reports";
import { toRuleCandidate } from "../candidate.dto";
import { average, median, timeToFillDays } from "@destaworks/domain/reports/metrics";
import { loadCohort } from "./cohort";

const ACTION_LICENSE_STATUS_SET = new Set<string>(ACTION_LICENSE_STATUSES);
const REQUIRING_ACTION_LIMIT = 200;

export const timeReportsService = {
  /** Time Analysis — time-in-stage + Time-to-Fill (legacy `index.html:8611-8654`). */
  async timeAnalysis(filters: ReportFilters): Promise<TimeAnalysisDTO> {
    const cohort = await loadCohort(filters);
    const now = new Date();

    const timeInStage = ACTIVE_STATUS_CODES.map((status) => {
      const days = cohort.candidates
        .filter((c) => c.status === status)
        .map((c) => getDaysInStage(c.stageEnteredAt, now));
      return {
        status,
        label: statusLabel(status),
        avgDays: average(days),
        maxDays: days.length > 0 ? Math.max(...days) : null,
        slaDays: statusSlaDays(status),
      };
    });

    const ttf = cohort.candidates
      .map((c) => timeToFillDays(c))
      .filter((d): d is number => d !== null);

    return {
      timeInStage,
      timeToFill: { avgDays: average(ttf), medianDays: median(ttf), count: ttf.length },
    };
  },

  /** Compliance — license-status breakdown + candidates requiring action (legacy `:8656-8683`). */
  async compliance(filters: ReportFilters, clock: Clock = systemClock): Promise<ComplianceDTO> {
    const cohort = await loadCohort(filters);
    const now = clock.now();

    const countByLicenseStatus = new Map<string, number>();
    for (const c of cohort.candidates) {
      countByLicenseStatus.set(
        c.licenseStatus,
        (countByLicenseStatus.get(c.licenseStatus) ?? 0) + 1,
      );
    }
    const byLicenseStatus = [...countByLicenseStatus.entries()].map(([licenseStatus, count]) => ({
      licenseStatus,
      count,
    }));

    const requiringAction = cohort.candidates
      .map((c) => {
        const rules = c.clientId ? cohort.rulesByClient.get(c.clientId) : undefined;
        const dq = getAutoDisqualify(toRuleCandidate(c), rules ?? null, now);
        const reasons = ACTION_LICENSE_STATUS_SET.has(c.licenseStatus)
          ? [`License ${c.licenseStatus.toLowerCase()}`, ...dq]
          : dq;
        return { c, reasons };
      })
      .filter(({ reasons }) => reasons.length > 0)
      .slice(0, REQUIRING_ACTION_LIMIT)
      .map(({ c, reasons }) => ({
        id: c.id,
        name: c.name,
        clientName: c.clientId ? (cohort.clientNames.get(c.clientId) ?? null) : null,
        licenseStatus: c.licenseStatus,
        reasons,
      }));

    return { byLicenseStatus, requiringAction };
  },
};
