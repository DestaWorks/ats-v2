import { Injectable, type CanActivate, type ExecutionContext } from "@nestjs/common";
import { requireUser } from "@destaworks/auth/guards";
import { runWithRequestContext } from "../request-context/nest-request-context";
import type { AuthenticatedRequest } from "./authenticated-request";

/**
 * Authenticates an internal user from the Better Auth session and attaches it as `request.user`.
 * The Nest port of `requireUser()` — 401 when there is no session.
 *
 * It calls the same `requireUser` the Next.js routes call rather than re-deriving it, so the role
 * still comes from the session record and an unknown or forged role still collapses to the least
 * privileged one. Authentication only: it grants no capability, and a route that needs one stacks
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
