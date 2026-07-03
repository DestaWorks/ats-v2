import type { CandidateStatus } from "@/lib/constants";
import type { RuleCandidate } from "./types";

/**
 * Track-aware stage gates (ported from legacy `STAGE_REQUIRED`, re-keyed to status CODES).
 *
 * Each validator returns the list of *blocking* requirements for entering that stage.
 * An empty list means the move is allowed. Stages with no entry are ungated.
 *
 * SERVER-AUTHORITATIVE: services must call `checkStageGate` on every transition path —
 * single drag AND bulk move (the legacy bulk path bypassed gates; the rebuild does not).
 *
 * Track rule: "Operations" needs only contact info; "Clinical"/"Prescriber" need the
 * credential + license checks.
 */
type StageValidator = (c: RuleCandidate) => string[];

const hasContact = (c: RuleCandidate): boolean => Boolean(c.email || c.phone);
const isOperations = (c: RuleCandidate): boolean => c.track === "Operations";

const STAGE_REQUIRED: Partial<Record<CandidateStatus, StageValidator>> = {
  QUALIFIED_PRESCREEN: (c) => {
    const missing: string[] = [];
    if (isOperations(c)) {
      if (!hasContact(c)) missing.push("Contact info required (email or phone)");
    } else {
      if (!c.credential) missing.push("Credential required");
      if (!c.licenseState) missing.push("License state required");
    }
    return missing;
  },

  INITIAL_SCREENING: (c) => {
    const missing: string[] = [];
    if (!isOperations(c) && c.licenseStatus === "Not Verified") {
      missing.push("License must be verified first");
    }
    return missing;
  },

  DESTA_REVIEW: (c) => {
    const missing: string[] = [];
    if (!hasContact(c)) missing.push("Contact info required (email or phone)");
    return missing;
  },

  SUBMITTED_TO_CLIENT: (c) => {
    const missing: string[] = [];
    if (!isOperations(c) && c.licenseStatus !== "Active") {
      missing.push("License must be Active");
    }
    if (!c.clientId) missing.push("Client assignment required");
    if (!hasContact(c)) missing.push("Contact info required");
    return missing;
  },

  // CLIENT_INTERVIEW, OFFER_NEGOTIATION, OFFER_ACCEPTED, STARTED_DAY1: ungated.
};

/**
 * Blocking requirements for moving a candidate INTO `toStatus`.
 * Empty array = the transition is allowed.
 */
export function checkStageGate(candidate: RuleCandidate, toStatus: CandidateStatus): string[] {
  const validator = STAGE_REQUIRED[toStatus];
  return validator ? validator(candidate) : [];
}

/** Convenience: is the transition into `toStatus` allowed? */
export function canTransition(candidate: RuleCandidate, toStatus: CandidateStatus): boolean {
  return checkStageGate(candidate, toStatus).length === 0;
}
