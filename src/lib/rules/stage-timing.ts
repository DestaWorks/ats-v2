import { statusSlaDays, type CandidateStatus } from "@/lib/constants";

const MS_PER_DAY = 86_400_000;
const MS_PER_HOUR = 3_600_000;

/**
 * Stage-timing rules (ported from legacy `getDaysInStage` / overdue / stuck logic).
 *
 * The legacy app derived these from `UpdatedAt` (a generic last-write timestamp) — a known
 * data-model bug. The rebuild keys them off `stageEnteredAt` (the moment the candidate
 * entered its current stage). `now` is passed in so these stay pure and unit-testable.
 */

/** Whole days the candidate has been in its current stage. */
export function getDaysInStage(
  stageEnteredAt: Date | null | undefined,
  now: Date = new Date(),
): number {
  if (!stageEnteredAt) return 0;
  return Math.floor((now.getTime() - stageEnteredAt.getTime()) / MS_PER_DAY);
}

/**
 * Overdue = past the stage's SLA. Mirrors the legacy `hoursInStage >= SLA*24` comparison.
 * Stages with no SLA (Started + terminals) are never overdue.
 */
export function isOverdue(
  status: CandidateStatus,
  stageEnteredAt: Date | null | undefined,
  now: Date = new Date(),
): boolean {
  const sla = statusSlaDays(status);
  if (sla === null || !stageEnteredAt) return false;
  const hoursInStage = Math.floor((now.getTime() - stageEnteredAt.getTime()) / MS_PER_HOUR);
  return hoursInStage >= sla * 24;
}

/** Stuck = sitting in a stage longer than `thresholdDays` (legacy default: 7). */
export function isStuck(
  stageEnteredAt: Date | null | undefined,
  now: Date = new Date(),
  thresholdDays = 7,
): boolean {
  return getDaysInStage(stageEnteredAt, now) > thresholdDays;
}
