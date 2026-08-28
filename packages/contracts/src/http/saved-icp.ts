/**
 * Wire shapes of the `/saved-icps` endpoints — the Client Discovery counterpart of
 * `./saved-view`, and deliberately a separate module: an ICP belongs to one search, a saved
 * view belongs to a scope, and nothing about the two shapes is shared.
 */
import type { SavedIcpDTO } from "../validation/saved-icp";

/** Response body of `GET /saved-icps`. */
export interface GetSavedIcpsResponse {
  savedIcps: SavedIcpDTO[];
}

/** Response body of `POST /saved-icps` (201). */
export interface PostSavedIcpResponse {
  savedIcp: SavedIcpDTO;
}

/** Response body of `DELETE /saved-icps/:id` — the id that was removed. */
export interface DeleteSavedIcpResponse {
  id: string;
}
