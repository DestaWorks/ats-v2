import type { ClientRules, RuleCandidate } from "./types";

export interface CandidateScore {
  score: number;
  max: number;
  /** 0–100, rounded. Relative to `max` (only dimensions the client constrains count). */
  pct: number;
  flags: string[];
}

/**
 * Score a candidate's fit for a client, out of 100 (ported from legacy `scoreCandidate`).
 *
 * Weights: State 30 · Credential 30 · Population 20 · Setting 10 · License-active 10.
 * `max` only accrues for dimensions the client actually constrains (non-empty rule array),
 * so `pct` is relative per client — a client with no rules scores 0/0 → 0%. License always
 * contributes 10 to max. Pass `clientRules` as data (it comes from the `client_rules` table).
 */
export function scoreCandidate(
  candidate: RuleCandidate,
  clientRules: ClientRules | null | undefined,
): CandidateScore {
  if (!clientRules) return { score: 0, max: 0, pct: 0, flags: [] };

  let score = 0;
  let max = 0;
  const flags: string[] = [];

  // State match (30)
  if (clientRules.states.length > 0) {
    max += 30;
    if (candidate.licenseState && clientRules.states.includes(candidate.licenseState)) {
      score += 30;
    } else {
      flags.push(`Wrong state for ${clientRules.name}`);
    }
  }

  // Credential match (30)
  if (clientRules.creds.length > 0) {
    max += 30;
    if (candidate.credential && clientRules.creds.includes(candidate.credential)) {
      score += 30;
    } else {
      flags.push(`Credential not typical for ${clientRules.name}`);
    }
  }

  // Population match (20)
  if (clientRules.pops.length > 0) {
    max += 20;
    if (candidate.population && clientRules.pops.includes(candidate.population)) {
      score += 20;
    } else if (candidate.population) {
      flags.push("Population mismatch");
    }
  }

  // Setting match (10)
  if (clientRules.settings.length > 0) {
    max += 10;
    if (candidate.setting && clientRules.settings.includes(candidate.setting)) {
      score += 10;
    }
  }

  // License status (10) — always counts toward max
  max += 10;
  if (candidate.licenseStatus === "Active") {
    score += 10;
  } else if (candidate.licenseStatus === "Expired") {
    flags.push("License expired");
  }

  const pct = max > 0 ? Math.round((score / max) * 100) : 0;
  return { score, max, pct, flags };
}
