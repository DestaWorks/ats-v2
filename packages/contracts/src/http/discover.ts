/**
 * Wire shapes of the `/discover` endpoints, shared by the Next.js routes and the NestJS
 * `DiscoverController`.
 */
import type {
  CoverageGapRowDTO,
  CoverageGapSupplyDTO,
  DiscoverSearchResultDTO,
} from "../validation/discover";

/**
 * Response body of `POST /discover/add`. A bulk add reports counts rather than rows: a row that
 * already matches a lead or candidate is skipped, not an error, so the caller needs to know how
 * many of its selection actually landed.
 */
export interface PostDiscoverAddResponse {
  added: number;
  skipped: number;
}

/** Response body of `GET /discover/coverage-gaps/supply`. */
export type GetDiscoverCoverageGapSupplyResponse = CoverageGapSupplyDTO;

/**
 * Response body of `GET /discover/search`. Request shape is `discoverSearchQuerySchema`.
 *
 * The rows are the public NPPES registry as it stands — no internal candidate field is joined in;
 * `dupStatus`/`dupMatchId` report only whether a registry row already exists here, never anything
 * about the record it matched beyond its display label.
 */
export type GetDiscoverSearchResponse = DiscoverSearchResultDTO;

/** Response body of `GET /discover/coverage-gaps` — one row per (credential, state), counts only. */
export type GetDiscoverCoverageGapsResponse = CoverageGapRowDTO[];
