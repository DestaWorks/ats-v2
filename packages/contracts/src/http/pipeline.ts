/**
 * Wire shapes of the `/candidates` board read.
 *
 * `GET /candidates` answers with one of two shapes depending on `column`, so the union IS the
 * contract — declared here rather than at a handler because the Next.js route and the NestJS
 * `CandidatesController` both answer it, and a union restated in either one is a union the other
 * can drift from (SAAS-RESTRUCTURE-PLAN, "Engineering standards → API contracts").
 */
import type { BoardResponse, ColumnPageDTO } from "../validation/pipeline";

/**
 * Response body of `GET /candidates` — the full funnel-grouped board, or one column's load-more
 * page when `column` is set. Callers discriminate on the payload's own keys (`columns` vs `items`).
 */
export type GetCandidatesResponse = BoardResponse | ColumnPageDTO;
