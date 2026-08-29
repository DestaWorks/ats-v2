/**
 * The wire shape every endpoint returns once it hands its work to the job runner instead of doing
 * it inline (SAAS-RESTRUCTURE-PLAN Phase 5). Declared once, in contracts, because it is the same
 * envelope for every such endpoint — a per-feature `{ jobId }` would be five copies of one
 * decision, and each of them free to drift.
 */

/** Accepted-and-queued. The work has NOT happened yet; the result arrives through the job. */
export interface EnqueuedJobResponse {
  /**
   * The queued job's id. Not necessarily new: an endpoint that enqueues with a `singletonKey`
   * returns the id of the job already pending for the same target, which is how clicking
   * "generate" twice costs one AI run rather than two.
   */
  jobId: string;
  /** The job definition's stable queue name, so a client knows what it is waiting on. */
  job: string;
}
