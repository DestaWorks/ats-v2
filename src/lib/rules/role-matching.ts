import type { LeadStatus } from "@/lib/constants/lead-status";
import type { RolePriority, RoleStatus, TriageBadge } from "@/lib/constants/open-role";

/**
 * Open Roles matching engine (Wave 3.5, ported from legacy `scoreMatch` / `matchesFor` /
 * `scoreMatchDormant` / the triage-strip formula at `index.html:4683-4790`). THREE distinct,
 * intentionally un-unified scales — porting legacy behavior exactly rather than collapsing them
 * into one "smarter" formula: the active matcher is client-tunable (`ClientMatchWeights`), the
 * dormant re-engagement scorer is fixed-weight, and the triage-strip ranker scores ROLES (not
 * leads) on priority/staleness/match-quality to answer "what should I work today."
 */

/** The role fields the matchers compare against a lead. */
export interface RuleRole {
  clientId: string | null;
  state: string | null;
  credential: string | null;
}

/** The lead fields the matchers compare against a role. */
export interface RuleLead {
  targetClientId: string | null;
  state: string | null;
  credential: string | null;
  status: LeadStatus;
}

/** One client's tunable weights for the active matcher (`client_match_profiles`, legacy `cpHeaders`). */
export interface ClientMatchWeights {
  weightSameClient: number;
  weightSameState: number;
  weightCredExact: number;
  weightCredPartial: number;
  weightRespondedHot: number;
  weightOutreach: number;
  weightSourced: number;
  penaltyCold: number;
  minScore: number;
}

/** System-wide fallback when a client has no saved profile (legacy `DEFAULTS`, `index.html:4664`). */
export const DEFAULT_MATCH_WEIGHTS: ClientMatchWeights = {
  weightSameClient: 30,
  weightSameState: 25,
  weightCredExact: 25,
  weightCredPartial: 15,
  weightRespondedHot: 20,
  weightOutreach: 10,
  weightSourced: 5,
  penaltyCold: 10,
  minScore: 25,
};

/** Leads that can never match ANY role — already placed or ruled out (legacy hard `-1` sentinel). */
const HARD_EXCLUDED_STATUSES: readonly LeadStatus[] = ["Promoted", "Bad Fit"];
const OUTREACH_STATUSES: readonly LeadStatus[] = ["Outreach 1", "Outreach 2", "Outreach 3 (Final)"];
const COLD_STATUSES: readonly LeadStatus[] = ["Responded — Cold", "No Response"];
/** Dormant re-engagement only considers leads that have gone quiet or stalled (legacy `scoreMatchDormant`). */
const DORMANT_ELIGIBLE_STATUSES: readonly LeadStatus[] = [
  "No Response",
  "Responded — Cold",
  "Future Collaboration",
];

/** Case-insensitive substring overlap either direction (legacy partial-credential match). */
function credentialsOverlap(a: string, b: string): boolean {
  const x = a.trim().toLowerCase();
  const y = b.trim().toLowerCase();
  if (!x || !y) return false;
  return x.includes(y) || y.includes(x);
}

/**
 * Score one lead's fit for one role, client-tunable. Returns `-1` for a hard-excluded lead
 * (Promoted/Bad Fit) — always below any realistic `minScore`, so callers can filter uniformly
 * with `score >= weights.minScore` without a separate exclusion check.
 */
export function scoreRoleMatch(
  role: RuleRole,
  lead: RuleLead,
  weights: ClientMatchWeights,
): number {
  if (HARD_EXCLUDED_STATUSES.includes(lead.status)) return -1;

  let score = 0;
  if (role.clientId && lead.targetClientId === role.clientId) score += weights.weightSameClient;
  if (role.state && lead.state && role.state === lead.state) score += weights.weightSameState;
  if (role.credential && lead.credential) {
    if (role.credential.trim().toLowerCase() === lead.credential.trim().toLowerCase()) {
      score += weights.weightCredExact;
    } else if (credentialsOverlap(role.credential, lead.credential)) {
      score += weights.weightCredPartial;
    }
  }
  if (lead.status === "Responded — Hot") score += weights.weightRespondedHot;
  else if (OUTREACH_STATUSES.includes(lead.status)) score += weights.weightOutreach;
  else if (lead.status === "Sourced") score += weights.weightSourced;
  if (COLD_STATUSES.includes(lead.status)) score -= weights.penaltyCold;

  return score;
}

/** One scored lead against a role — generic over the lead shape so callers can carry extra fields. */
export interface RoleMatch<L extends RuleLead> {
  lead: L;
  score: number;
}

/** Top matches for a role: filtered to `>= minScore`, sorted best-first, capped (legacy top 15). */
export function matchesForRole<L extends RuleLead>(
  role: RuleRole,
  leads: readonly L[],
  weights: ClientMatchWeights,
  limit = 15,
): RoleMatch<L>[] {
  return leads
    .map((lead) => ({ lead, score: scoreRoleMatch(role, lead, weights) }))
    .filter((m) => m.score >= weights.minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/** Fixed weights for re-engagement — NOT client-tunable (legacy `scoreMatchDormant`, distinct scale). */
const DORMANT_WEIGHTS = {
  sameClient: 30,
  sameState: 25,
  credExact: 25,
  credPartial: 15,
  minScore: 25,
};

/** Score one dormant (cold/no-response/future-collab) lead's fit for a role. `-1` if ineligible. */
export function scoreDormantMatch(role: RuleRole, lead: RuleLead): number {
  if (!DORMANT_ELIGIBLE_STATUSES.includes(lead.status)) return -1;

  let score = 0;
  if (role.clientId && lead.targetClientId === role.clientId) score += DORMANT_WEIGHTS.sameClient;
  if (role.state && lead.state && role.state === lead.state) score += DORMANT_WEIGHTS.sameState;
  if (role.credential && lead.credential) {
    if (role.credential.trim().toLowerCase() === lead.credential.trim().toLowerCase()) {
      score += DORMANT_WEIGHTS.credExact;
    } else if (credentialsOverlap(role.credential, lead.credential)) {
      score += DORMANT_WEIGHTS.credPartial;
    }
  }
  return score;
}

/** Top dormant re-engagement matches for a role (legacy top 10). */
export function dormantMatchesForRole<L extends RuleLead>(
  role: RuleRole,
  leads: readonly L[],
  limit = 10,
): RoleMatch<L>[] {
  return leads
    .map((lead) => ({ lead, score: scoreDormantMatch(role, lead) }))
    .filter((m) => m.score >= DORMANT_WEIGHTS.minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/** The role fields the triage-strip ranker needs (a structural subset of an OpenRole row). */
export interface RuleRoleForTriage {
  status: RoleStatus;
  priority: RolePriority;
  openedAt: Date;
}

const PRIORITY_POINTS: Record<RolePriority, number> = { P1: 30, P2: 15, P3: 5 };
const ON_HOLD_PENALTY = 15;
const STRONG_MATCH_POINTS = 4;
const HOT_MATCH_POINTS = 12;
const STRONG_MATCH_THRESHOLD = 50;
const MAX_STALENESS_POINTS = 30;
const STALENESS_POINTS_PER_DAY = 1.5;
const STALE_DAYS = 21;
const AGING_DAYS = 14;
const EASY_DAYS = 7;
const EASY_STRONG_COUNT = 3;

export interface TriageResult {
  score: number;
  badge: TriageBadge;
  daysOpen: number;
}

/**
 * Score + badge one role for the triage strip ("top 3 roles to work now", legacy `index.html:4734-4790`).
 * `strongMatches`/`hotMatches` are precomputed by the caller from that role's `matchesForRole` result
 * (strong = score ≥ 50, hot = the matched lead's status is Responded — Hot) — this stays pure/DB-free.
 */
export function triageScore(
  role: RuleRoleForTriage,
  strongMatches: number,
  hotMatches: number,
  now: Date,
): TriageResult {
  const daysOpen = Math.floor((now.getTime() - role.openedAt.getTime()) / 86_400_000);
  let score =
    PRIORITY_POINTS[role.priority] +
    Math.min(daysOpen * STALENESS_POINTS_PER_DAY, MAX_STALENESS_POINTS) +
    strongMatches * STRONG_MATCH_POINTS +
    hotMatches * HOT_MATCH_POINTS;
  if (role.status === "On Hold") score -= ON_HOLD_PENALTY;

  let badge: TriageBadge;
  if (hotMatches > 0) badge = "HOT";
  else if (daysOpen >= STALE_DAYS) badge = "STALE";
  else if (role.priority === "P1" && strongMatches === 0) badge = "GAP";
  else if (strongMatches >= EASY_STRONG_COUNT && daysOpen <= EASY_DAYS) badge = "EASY";
  else if (daysOpen >= AGING_DAYS && strongMatches > 0) badge = "STALE";
  else badge = role.priority;

  return { score, badge, daysOpen };
}

/** A role is "strong" for triage-badge purposes at this score threshold. */
export function isStrongMatch(score: number): boolean {
  return score >= STRONG_MATCH_THRESHOLD;
}
