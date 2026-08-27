import { UNVERIFIED_LICENSE_STATUSES, type CandidateStatus } from "../constants";
import { effectiveLicenseStatus } from "./license";
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
type StageValidator = (c: RuleCandidate, now: Date) => string[];

const hasContact = (c: RuleCandidate): boolean => Boolean(c.email || c.phone);
const isOperations = (c: RuleCandidate): boolean => c.track === "Operations";
const isUnverified = (c: RuleCandidate): boolean =>
  !c.licenseStatus || UNVERIFIED_LICENSE_STATUSES.includes(c.licenseStatus);

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
    if (!isOperations(c) && isUnverified(c)) {
      missing.push("License must be verified first");
    }
    return missing;
  },

  DESTA_REVIEW: (c) => {
    const missing: string[] = [];
    if (!hasContact(c)) missing.push("Contact info required (email or phone)");
    return missing;
  },

  SUBMITTED_TO_CLIENT: (c, now) => {
    const missing: string[] = [];
    if (!isOperations(c) && effectiveLicenseStatus(c, now) !== "Active") {
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
export function checkStageGate(
  candidate: RuleCandidate,
  toStatus: CandidateStatus,
  now: Date,
): string[] {
  const validator = STAGE_REQUIRED[toStatus];
  return validator ? validator(candidate, now) : [];
}

/** Convenience: is the transition into `toStatus` allowed? */
export function canTransition(
  candidate: RuleCandidate,
  toStatus: CandidateStatus,
  now: Date,
): boolean {
  return checkStageGate(candidate, toStatus, now).length === 0;
}
