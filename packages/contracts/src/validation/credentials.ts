/**
 * Credentials Intelligence dashboard contract (Wave 3.6) — DTO-only (no request body; this is a
 * read-only leadership dashboard, `GET /api/credentials/overview`). Mirrors
 * `validation/license-verify.ts`'s DTO-only-file pattern.
 */

export interface CredentialsStatCardsDTO {
  total: number;
  active: number;
  unverified: number;
  expired: number;
  expiringSoon: number;
  nlcCompact: number;
}

export interface CoverageMatrixCellDTO {
  credential: string;
  state: string;
  total: number;
  unverified: number;
  /** True when this cell is empty (total === 0) AND some client's rules require this exact
   *  credential+state combination — the red "GAP" flag. */
  needed: boolean;
}

export interface CoverageMatrixDTO {
  /** Column order — states actually present among current candidates. */
  states: string[];
  /** Row order — credentials actually present among current candidates. */
  credentials: string[];
  cells: CoverageMatrixCellDTO[];
}

export interface GapAnalysisRowDTO {
  clientId: string;
  clientName: string;
  credential: string;
  inPipeline: number;
  verified: number;
  screening: number;
  submitted: number;
  placed: number;
  gap: boolean;
}

export interface NlcHolderDTO {
  id: string;
  name: string;
  credential: string | null;
  licenseState: string | null;
  /** Always `COMPACT_STATES.length - 1` today (one canonical list) — kept as a field, not a
   *  hardcoded UI constant, so it stays correct if the compact-state list ever changes. */
  additionalStatesCount: number;
}

export interface CredentialsOverviewDTO {
  stats: CredentialsStatCardsDTO;
  matrix: CoverageMatrixDTO;
  gapAnalysis: GapAnalysisRowDTO[];
  nlcHolders: NlcHolderDTO[];
}
