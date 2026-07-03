import type { ClientRules, RuleCandidate } from "./types";

/**
 * Hard auto-disqualification reasons (ported from legacy `getAutoDisqualify`).
 * Returns an empty array when the candidate is not disqualified.
 *
 * Distinct from `scoreCandidate` flags (soft signals): a candidate can score high yet be
 * auto-disqualified (e.g. expired license). `clientRules` is optional — the state-mismatch
 * check is skipped when the candidate has no client rules to check against.
 */
export function getAutoDisqualify(
  candidate: RuleCandidate,
  clientRules: ClientRules | null | undefined,
): string[] {
  const dq: string[] = [];

  if (candidate.licenseStatus === "Expired") dq.push("License expired");
  if (candidate.licenseStatus === "Under Investigation") {
    dq.push("License under investigation");
  }

  if (
    clientRules &&
    clientRules.states.length > 0 &&
    candidate.licenseState &&
    !clientRules.states.includes(candidate.licenseState)
  ) {
    dq.push(
      `License state (${candidate.licenseState}) does not match ${clientRules.name} ` +
        `requirements (${clientRules.states.join("/")})`,
    );
  }

  return dq;
}
