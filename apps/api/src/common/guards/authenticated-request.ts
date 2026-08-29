import type { AuthContext } from "@destaworks/auth/guards";
import type { PortalContext } from "@destaworks/auth/portal-guards";
import type { TenantContext } from "@destaworks/domain/tenant";
import type { HttpRequestLike } from "../request-context/nest-request-context";

/**
 * What a guard may attach to the request, and the only two identities this API recognises.
 *
 * They are separate properties on purpose. An internal user is resolved from a Better Auth
 * session together with the tenant they are acting in, and carries that tenant's role; a portal
 * contact is an external client contact resolved from a token cookie and holds no role at all.
 * Nothing may promote one into the other.
 */

/** A request the `SessionAuthGuard` has authenticated and resolved a tenant for. */
export interface AuthenticatedRequest extends HttpRequestLike {
  user?: AuthContext;
}

/** A request the `PortalAuthGuard` has authenticated. */
export interface PortalRequest extends HttpRequestLike {
  portal?: PortalContext;
}

/**
 * A request the `TenantGuard` has placed in a tenant.
 *
 * Extends the authenticated request rather than standing beside it: a tenant is resolved for a
 * known person and for nobody else, so the two are always present together. `url`/`originalUrl`
 * are declared here because the guard reads a `/t/<slug>` claim off the path, which the
 * request-context port — headers and cookies only — deliberately does not expose.
 */
export interface TenantScopedRequest extends AuthenticatedRequest {
  readonly url?: string | undefined;
  /** Express's pre-rewrite target; preferred when present so a mount cannot truncate the claim. */
  readonly originalUrl?: string | undefined;
  tenant?: TenantContext;
}
