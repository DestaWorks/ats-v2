import { Injectable, type CanActivate, type ExecutionContext } from "@nestjs/common";
import { requirePlatformIdentity } from "@destaworks/auth/platform-guards";
import { runWithRequestContext } from "../request-context/nest-request-context";
import type { PlatformRequest } from "./authenticated-request";

/**
 * Authenticates the platform console against its OWN auth instance.
 *
 * Distinct from `IdentityAuthGuard`, which authenticates the operator app's cookie and still serves
 * the workspace switcher. `/platform/*` must not accept a workspace session, and the console's
 * cookie must not authenticate a tenant route — one guard could not do both.
 */
@Injectable()
export class PlatformAuthGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<PlatformRequest>();
    request.identity = await runWithRequestContext(request, () => requirePlatformIdentity());
    return true;
  }
}
