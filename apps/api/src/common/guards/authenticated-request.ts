import type { AuthUser } from "@destaworks/auth/guards";
import type { PortalContext } from "@destaworks/auth/portal-guards";
import type { HttpRequestLike } from "../request-context/nest-request-context";

/**
 * What a guard may attach to the request, and the only two identities this API recognises.
 *
 * They are separate properties on purpose. An internal user carries one of the six fixed roles
 * and is resolved from a Better Auth session; a portal contact is an external client contact
 * resolved from a token cookie and holds no role at all. Nothing may promote one into the other.
 */

/** A request the `SessionAuthGuard` has authenticated. */
export interface AuthenticatedRequest extends HttpRequestLike {
  user?: AuthUser;
}

/** A request the `PortalAuthGuard` has authenticated. */
export interface PortalRequest extends HttpRequestLike {
  portal?: PortalContext;
}
