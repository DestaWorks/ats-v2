import {
  isTerminalStatus,
  statusLabel,
  statusOrder,
  type CandidateStatus,
} from "../constants/pipeline-status";
import { effectiveLicenseStatus } from "./license";
import { getDaysInStage, isOverdue, isStuck } from "./stage-timing";
import type { RuleCandidate } from "./types";

/**
 * What the Overview's "what to do next" queue proposes, and why.
 *
 * Deliberately NOT model-ranked. Every action here is a consequence of a rule the pipeline already
 * enforces — a stage SLA, the stuck threshold, the licence gate — so the list is deterministic,
 * instant, and identical for two people looking at the same workspace. A model deciding the order
 * would make "why is this first?" unanswerable, which is the opposite of what a work queue is for.
 */
export const NEXT_ACTION_TYPES = ["NUDGE", "STALE", "VERIFY"] as const;
export type NextActionType = (typeof NEXT_ACTION_TYPES)[number];

/** P1 is past an SLA the pipeline set; P2 is slipping; P3 is owed but not yet costing anything. */
export type NextActionPriority = "P1" | "P2" | "P3";

/** The stages where the ball is with the CLIENT — chasing anyone else would be chasing ourselves. */
const AWAITING_CLIENT: readonly CandidateStatus[] = ["SUBMITTED_TO_CLIENT", "CLIENT_INTERVIEW"];

/** Stage order of the first client-facing stage; anything earlier is ours to move. */
const FIRST_CLIENT_STAGE_ORDER = statusOrder("SUBMITTED_TO_CLIENT");

export interface NextActionCandidate extends RuleCandidate {
  id: string;
  name: string;
  stageEnteredAt: Date | null;
}

export interface NextAction {
  type: NextActionType;
  priority: NextActionPriority;
  candidateId: string;
  candidateName: string;
  status: CandidateStatus;
  statusLabel: string;
  daysInStage: number;
  /** A complete sentence, already interpolated. Templated — never model-written. */
  reason: string;
}

/**
 * Every action one candidate currently warrants — none, one, or several.
 *
 * A list rather than a single verdict because the cases are independent: a candidate can be both
 * sitting too long in a stage AND missing a licence check, and collapsing those into one row would
 * hide whichever lost. They are separate pieces of work, done by different people, at different
 * times.
 */
export function nextActionsFor(candidate: NextActionCandidate, now: Date): NextAction[] {
  const status = candidate.status;
  if (isTerminalStatus(status)) return [];

  const days = getDaysInStage(candidate.stageEnteredAt, now);
  const overdue = isOverdue(status, candidate.stageEnteredAt, now);
  const base = {
    candidateId: candidate.id,
    candidateName: candidate.name,
    status,
    statusLabel: statusLabel(status),
    daysInStage: days,
  };
  const actions: NextAction[] = [];

  if (AWAITING_CLIENT.includes(status) && overdue) {
    actions.push({
      ...base,
      type: "NUDGE",
      priority: "P1",
      reason: `${candidate.name} has been at ${statusLabel(status)} for ${days} days with no client response; follow up with the client.`,
    });
  }

  if (statusOrder(status) < FIRST_CLIENT_STAGE_ORDER && isStuck(candidate.stageEnteredAt, now)) {
    actions.push({
      ...base,
      type: "STALE",
      priority: overdue ? "P1" : "P2",
      reason: `${candidate.name} has been at ${statusLabel(status)} for ${days} days; re-engage to move this candidate forward or close them out.`,
    });
  }

  const verify = verificationFor(candidate, now);
  if (verify !== null) actions.push({ ...base, ...verify });

  return actions;
}

/**
 * The licence action, if one is owed.
 *
 * A LAPSED licence outranks a never-verified one: the candidate was advanceable yesterday and is
 * not today, so work already done is at risk. A missing check is owed, but nothing has changed.
 * Operations candidates carry no licence, so they are never asked for one.
 */
function verificationFor(
  candidate: NextActionCandidate,
  now: Date,
): Pick<NextAction, "type" | "priority" | "reason"> | null {
  if (candidate.track !== "Clinical") return null;

  const effective = effectiveLicenseStatus(candidate, now);
  const where = candidate.licenseState ? `${candidate.licenseState} licence` : "licence";

  if (effective === "Expired") {
    return {
      type: "VERIFY",
      priority: "P2",
      reason: `${candidate.name}'s ${where} has expired; re-verify before this candidate can advance.`,
    };
  }
  if (effective === "Active") return null;

  return {
    type: "VERIFY",
    priority: "P3",
    reason: `${candidate.name}'s ${where} is unverified; verification is required before submission to a client.`,
  };
}

const PRIORITY_RANK: Record<NextActionPriority, number> = { P1: 0, P2: 1, P3: 2 };

/** Worst first, then longest-waiting, then by name so the order never shuffles between reads. */
export function rankNextActions(actions: NextAction[]): NextAction[] {
  return [...actions].sort(
    (a, b) =>
      PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] ||
      b.daysInStage - a.daysInStage ||
      a.candidateName.localeCompare(b.candidateName),
  );
}
