import { Injectable, type CanActivate, type ExecutionContext } from "@nestjs/common";
import { requireSignedInIdentity } from "@destaworks/auth/guards";
import { runWithRequestContext } from "../request-context/nest-request-context";
import type { PlatformRequest } from "./authenticated-request";

/**
 * Authenticates an identity WITHOUT resolving a tenant, and attaches it as `request.identity`.
 *
 * `SessionAuthGuard` cannot serve the platform plane. It calls `requireUser()`, which 401s when
 * the session resolves to no tenant — and a platform admin belonging to no tenant is the normal
 * case, not an edge one. It also 401s an admin who happens to be a member of two workspaces and
 * sent no claim, because that resolves `ambiguous`. Either way the `/platform/*` endpoints were
 * unreachable for exactly the operator they exist for.
 *
 * Authentication only, on a separate property from `request.user`: an identity is not a context,
 * it reaches no repository, and nothing here promotes one into the other. Authorization stays
 * where 6.8 put it — `requirePlatformCapability` inside the service, in the same call that writes
 * the audit row.
 */
@Injectable()
export class PlatformAuthGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<PlatformRequest>();
    request.identity = await runWithRequestContext(request, () => requireSignedInIdentity());
    return true;
  }
}
