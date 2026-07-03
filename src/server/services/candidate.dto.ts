import "server-only";
import {
  hasCapability,
  type CandidateStatus,
  type LicenseStatus,
  type Role,
  type Track,
} from "@/lib/constants";
import type { CandidateRow } from "@/server/repositories/candidate.repository";
import type { RuleCandidate } from "@/server/rules/types";

/** Minimal viewer shape the DTO needs — only the role drives the PII gate. */
export interface DtoViewer {
  role: Role;
}

/**
 * Candidate as exposed to a viewer. Everything from the row except `licenseNumber`, which is
 * present only when the viewer holds `viewCredentials` (see `toCandidateDTO` — the PII boundary).
 */
export type CandidateDTO = Omit<CandidateRow, "licenseNumber"> & { licenseNumber?: string | null };

/**
 * Map a candidate row to its DTO. THE PII BOUNDARY: `licenseNumber` (sensitive PII) is omitted
 * unless the viewer has `viewCredentials`. Everything server-side above this mapper works on the
 * raw row; nothing below the API returns `licenseNumber` to an unauthorized viewer.
 */
export function toCandidateDTO(row: CandidateRow, viewer: DtoViewer): CandidateDTO {
  const { licenseNumber, ...rest } = row;
  if (hasCapability(viewer.role, "viewCredentials")) {
    return { ...rest, licenseNumber };
  }
  return rest;
}

/**
 * Project a candidate row onto the minimal `RuleCandidate` the pure rules operate on
 * (`scoreCandidate`, `checkStageGate`, timing). Stored strings are cast to their constant
 * unions — values are validated with zod on write, so the cast is safe at read time.
 */
export function toRuleCandidate(row: CandidateRow): RuleCandidate {
  return {
    status: row.status as CandidateStatus,
    track: row.track as Track,
    credential: row.credential,
    licenseState: row.licenseState,
    licenseStatus: row.licenseStatus as LicenseStatus,
    population: row.population,
    setting: row.setting,
    clientId: row.clientId,
    email: row.email,
    phone: row.phone,
  };
}
