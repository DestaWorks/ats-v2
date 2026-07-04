import type { CandidateStatus, LicenseStatus, Track } from "@/lib/constants";

/**
 * Minimal candidate shape the pure rules operate on. Decoupled from the Prisma
 * model so the rules stay pure and unit-testable (services map the DB row to this).
 */
export interface RuleCandidate {
  status: CandidateStatus;
  track: Track;
  credential?: string | null;
  licenseState?: string | null;
  licenseStatus?: LicenseStatus | null;
  population?: string | null;
  setting?: string | null;
  /** Whether a client is assigned (the submit gate needs a client). */
  clientId?: string | null;
  email?: string | null;
  phone?: string | null;
}

/**
 * Client matching rules — DATA passed as an argument (DECISIONS: `client_rules` is a
 * table, not code). `name` is the client's display name, used in score flags / DQ reasons.
 * Empty arrays mean "no constraint on this dimension" (that dimension scores nothing).
 */
export interface ClientRules {
  name: string;
  states: readonly string[];
  creds: readonly string[];
  pops: readonly string[];
  settings: readonly string[];
}
