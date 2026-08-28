/**
 * Wire shapes of the `/discover` endpoints — the two lookups Client Discovery cannot serve from
 * its own server render, shared by the Next.js routes and the NestJS `DiscoverController`.
 */
import type { CoverageGapSupplyDTO } from "../validation/discover";

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
