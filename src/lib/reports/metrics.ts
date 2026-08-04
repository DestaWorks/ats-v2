/**
 * Pure, isomorphic report math (Wave 5.2). No server imports — safe to unit-test directly and to
 * share between report services that must NOT disagree (legacy had Time-to-Fill and Source-of-Hire
 * computed twice, slightly differently, once in Reports and once in the standalone KPI view —
 * `time-reports.service.ts` is now the single source; the KPI view was folded into Reports as the
 * Client Capacity tab 2026-08-03 and never needed these two metrics).
 */

export function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
  }
  return sorted[mid] ?? 0;
}

/** Nearest-rank percentile (p in [0,100]) — used for p90 time-to-place. */
export function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.min(Math.max(rank, 0), sorted.length - 1)] ?? 0;
}

/** Days from `createdAt` to `placedAt` — the ONE Time-to-Fill definition (uses the already-fixed
 *  `placedAt` column, never legacy's generic `UpdatedAt`). `null` when the candidate isn't placed. */
export function timeToFillDays(candidate: {
  createdAt: Date;
  placedAt: Date | null;
}): number | null {
  if (!candidate.placedAt) return null;
  return Math.round((candidate.placedAt.getTime() - candidate.createdAt.getTime()) / 86_400_000);
}
