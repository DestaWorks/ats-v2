/**
 * Pure "how far did this candidate progress" math (Wave 5.2) — the core fix for legacy's
 * `STATUSES.indexOf(status) >= idx` bug (a rejected candidate's terminal status code sorts ABOVE
 * most active stages, so naive current-status comparison silently counts them as having "reached"
 * stages they may never have touched). No server imports — safe to unit-test directly.
 */

/**
 * The highest ACTIVE-stage order a candidate had reached as of `asOf`, combining a real
 * stage-history max (computed server-side from `stage_history`, terminal transitions already
 * excluded there) with a floor of 0 (`NEW_CANDIDATE`) for any candidate that already existed by
 * `asOf` — every candidate starts there BEFORE their first move, so a candidate with zero history
 * rows yet (brand new, never moved) still correctly counts as having "reached" New Candidate
 * rather than being dropped from every funnel bucket. `-1` (reaches nothing) when the candidate
 * didn't exist yet at `asOf`.
 */
export function activeOrderAsOf(
  candidate: { createdAt: Date },
  historyMax: Map<string, number>,
  candidateId: string,
  asOf: Date,
): number {
  const floor = candidate.createdAt <= asOf ? 0 : -1;
  return Math.max(historyMax.get(candidateId) ?? -1, floor);
}
