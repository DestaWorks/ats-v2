/**
 * Wire shapes of the `/saved-views` endpoints.
 *
 * They live here rather than in a handler because two transports now answer them — the Next.js
 * route and the NestJS `SavedViewsController` — and a shape declared in either one would be a
 * shape the other could drift from (SAAS-RESTRUCTURE-PLAN, "Engineering standards → API contracts").
 */
import type { SavedViewDTO } from "../validation/saved-view";

/** Response body of `GET /saved-views`. */
export interface GetSavedViewsResponse {
  savedViews: SavedViewDTO[];
}

/** Response body of `POST /saved-views` (201). */
export interface PostSavedViewResponse {
  savedView: SavedViewDTO;
}

/** Response body of `DELETE /saved-views/:id` — the id that was removed. */
export interface DeleteSavedViewResponse {
  id: string;
}
