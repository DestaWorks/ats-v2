import { Injectable, type CanActivate, type ExecutionContext } from "@nestjs/common";
import { requireUser } from "@destaworks/auth/guards";
import { runWithRequestContext } from "../request-context/nest-request-context";
import type { AuthenticatedRequest } from "./authenticated-request";

/**
 * Authenticates an internal user, resolves the tenant they are acting in, and attaches the whole
 * context as `request.user`. The Nest port of `requireUser()` — 401 when there is no session, and
 * equally when the session can act in no tenant.
 *
 * This is where a tenant is resolved for this stack, and the only place: it calls the same
 * `requireUser` the Next.js routes call rather than re-deriving anything, so both stacks share one
 * resolution path and one definition of "which tenant is this". The role comes from that tenant's
 * membership, and an unknown or forged value still collapses to the least privileged role.
 * Authentication only: it grants no capability, and a route that needs one stacks
 * `CapabilityGuard`.
 */
@Injectable()
export class SessionAuthGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    request.user = await runWithRequestContext(request, () => requireUser());
    return true;
  }
}
