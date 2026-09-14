/**
 * Client Health Score (Wave 4.2 CRM) — the ONE canonical formula, pure/no I/O. Legacy computed
 * this 3 DIFFERENT ways (the Overview tab's health score, Compare's "Quick Health," and a third
 * Churn-Risk % — all disagreeing, `legacy/index.html:7014-7025`, `:7344`) — this module is the
 * single source both `crm-analytics.service.ts`'s detail read AND its Compare table call.
 *
 * A deliberate 3-factor design, not legacy's 4-factor one: legacy's 4th factor ("onboarding
 * steps completed") depends on a checklist concept this rebuild never built (not asked for
 * anywhere in IMPLEMENTATION-PLAN.md) — reweighted here rather than inventing a whole onboarding
 * subsystem to satisfy one formula term.
 */

export type ClientHealthTier = "Healthy" | "Needs Attention" | "At Risk";

export interface ClientHealthInput {
  /** Count of this client's non-terminal (active) pipeline candidates. */
  activeCandidateCount: number;
  /** Days since the most recent logged touch (note/meeting/deal update) — `null` if never touched. */
  daysSinceLastTouch: number | null;
  doneTaskCount: number;
  totalTaskCount: number;
}

export interface ClientHealthBreakdown {
  pipeline: number; // 0-40
  communication: number; // 0-35
  tasks: number; // 0-25
}

export interface ClientHealthResult {
  score: number; // 0-100
  tier: ClientHealthTier;
  breakdown: ClientHealthBreakdown;
}

const PIPELINE_MAX = 40;
const PIPELINE_POINTS_PER_CANDIDATE = 8;

const COMMUNICATION_MAX = 35;
/** "No data" default — deliberately less generous than legacy's ~50%-of-max default. */
const COMMUNICATION_NO_DATA = 15;

const TASKS_MAX = 25;
const TASKS_NO_DATA = 12;

const HEALTHY_THRESHOLD = 75;
const NEEDS_ATTENTION_THRESHOLD = 50;

function pipelineScore(activeCandidateCount: number): number {
  return Math.min(PIPELINE_MAX, activeCandidateCount * PIPELINE_POINTS_PER_CANDIDATE);
}

function communicationScore(daysSinceLastTouch: number | null): number {
  if (daysSinceLastTouch === null) return COMMUNICATION_NO_DATA;
  if (daysSinceLastTouch <= 7) return COMMUNICATION_MAX;
  if (daysSinceLastTouch <= 14) return 25;
  if (daysSinceLastTouch <= 30) return 12;
  return 0;
}

function tasksScore(done: number, total: number): number {
  if (total === 0) return TASKS_NO_DATA;
  return Math.round((done / total) * TASKS_MAX);
}

function tierFor(score: number): ClientHealthTier {
  if (score >= HEALTHY_THRESHOLD) return "Healthy";
  if (score >= NEEDS_ATTENTION_THRESHOLD) return "Needs Attention";
  return "At Risk";
}

export function computeHealthScore(input: ClientHealthInput): ClientHealthResult {
  const breakdown: ClientHealthBreakdown = {
    pipeline: pipelineScore(input.activeCandidateCount),
    communication: communicationScore(input.daysSinceLastTouch),
    tasks: tasksScore(input.doneTaskCount, input.totalTaskCount),
  };
  const score = breakdown.pipeline + breakdown.communication + breakdown.tasks;
  return { score, tier: tierFor(score), breakdown };
}
