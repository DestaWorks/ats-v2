/**
 * Stage-mover option builder (pure, unit-tested). Given the current candidate and its status,
 * produces one option per pipeline status marking each target valid/invalid via the isomorphic
 * `checkStageGate` (OQ-4: the full detail DTO carries email/phone/population/setting, so a faithful
 * client-side pre-check is possible — unlike the sparse board card). The SERVER stays authoritative;
 * this only disables options the gate would reject, surfacing the reasons up-front.
 */
import {
  ALL_STATUS_CODES,
  statusLabel,
  type CandidateStatus,
  type LicenseStatus,
  type Track,
} from "@/lib/constants";
import { checkStageGate } from "@/lib/rules/stage-gates";
import type { RuleCandidate } from "@/lib/rules/types";

/** The subset of the candidate profile the stage gates read. */
export interface StageMoverCandidate {
  status: CandidateStatus;
  track: Track;
  credential: string | null;
  licenseState: string | null;
  licenseStatus: LicenseStatus;
  population: string | null;
  setting: string | null;
  clientId: string | null;
  email: string | null;
  phone: string | null;
}

/** One selectable stage in the mover. `current` is the candidate's present stage. */
export interface StageMoverOption {
  code: CandidateStatus;
  label: string;
  /** True when the move into this stage passes the client-side gate mirror. */
  valid: boolean;
  /** Blocking reasons from `checkStageGate` (empty when valid). */
  reasons: string[];
  current: boolean;
}

/** Map the detail candidate onto the minimal `RuleCandidate` the gates consume. */
export function toRuleCandidate(c: StageMoverCandidate): RuleCandidate {
  return {
    status: c.status,
    track: c.track,
    credential: c.credential,
    licenseState: c.licenseState,
    licenseStatus: c.licenseStatus,
    population: c.population,
    setting: c.setting,
    clientId: c.clientId,
    email: c.email,
    phone: c.phone,
  };
}

/**
 * Build the full option list. The current stage is always `valid` (staying put is a no-op — the
 * mover disables it as the selected value, not as an invalid gate). Every other target is checked.
 */
export function buildStageMoverOptions(c: StageMoverCandidate): StageMoverOption[] {
  const rule = toRuleCandidate(c);
  return ALL_STATUS_CODES.map((code) => {
    const current = code === c.status;
    const reasons = current ? [] : checkStageGate(rule, code);
    return {
      code,
      label: statusLabel(code),
      valid: reasons.length === 0,
      reasons,
      current,
    };
  });
}
