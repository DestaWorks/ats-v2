/**
 * Rules engine — pure, server-authoritative domain logic (DECISIONS: scoring, gates,
 * disqualify, and status normalization live here; the client displays server-computed
 * results rather than re-deriving them). No IO, fully unit-tested.
 */

export type { RuleCandidate, ClientRules } from "./types";
export { scoreCandidate, type CandidateScore } from "./scoring";
export { getAutoDisqualify } from "./disqualify";
export { checkStageGate, canTransition } from "./stage-gates";
export { getDaysInStage, isOverdue, isStuck } from "./stage-timing";
export { normalizeLeadStatus } from "./normalize-lead-status";
export {
  DEFAULT_MATCH_WEIGHTS,
  scoreRoleMatch,
  matchesForRole,
  scoreDormantMatch,
  dormantMatchesForRole,
  triageScore,
  isStrongMatch,
  type RuleRole,
  type RuleLead,
  type ClientMatchWeights,
  type RoleMatch,
  type RuleRoleForTriage,
  type TriageResult,
} from "./role-matching";
