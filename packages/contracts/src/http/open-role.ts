/**
 * Wire shapes of the `/client-match-profiles` endpoints.
 *
 * All three verbs answer with the client's effective weights — a write returns what a subsequent
 * read would return, so the caller never has to re-fetch to learn the outcome. They are named
 * per endpoint even so, because a contract is per endpoint: if `DELETE` ever answers differently
 * from `GET`, the change is a type edit here, not a silent divergence at a handler.
 */
import type { ClientMatchProfileDTO } from "../validation/open-role";

/** Response body of `GET /client-match-profiles/:clientId`. */
export type GetClientMatchProfileResponse = ClientMatchProfileDTO;

/** Response body of `PUT /client-match-profiles/:clientId`. */
export type PutClientMatchProfileResponse = ClientMatchProfileDTO;

/** Response body of `DELETE /client-match-profiles/:clientId` — the system-default weights. */
export type DeleteClientMatchProfileResponse = ClientMatchProfileDTO;
