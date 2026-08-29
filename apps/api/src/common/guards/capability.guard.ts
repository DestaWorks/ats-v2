import { Injectable, type CanActivate, type ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { requireCapability } from "@destaworks/auth/guards";
import { AppError } from "@destaworks/integrations/http/app-error";
import { logger } from "@destaworks/config/logger";
import type { Capability } from "@destaworks/domain/constants";
import { CAPABILITY_METADATA } from "../decorators/require-capability.decorator";
import { runWithRequestContext } from "../request-context/nest-request-context";
import type { AuthenticatedRequest } from "./authenticated-request";

/**
 * The primary authorization guard: the Nest port of `requireCapability()`.
 *
 * Reads the capability a handler declared with `@RequireCapability(...)` and delegates to
 * `hasCapability` via the shared guard — 401 when signed out, 403 when the role does not grant it.
 * There is no role name in this file, and none can be introduced through the decorator either.
 *
 * The role it decides on is the ACTIVE TENANT's membership role, because that is what
 * `requireCapability` now resolves. Nothing here had to change for that: the guard never named a
 * role, so moving where a role comes from was a change to one function and not to this file.
 *
 * Attach it per route or per controller, never as a global `APP_GUARD`: a handler reached through
 * this guard without a declared capability is a misconfiguration on an authorization path, and is
 * refused rather than waved through. That makes a missing decorator fail visibly and closed.
 */
@Injectable()
export class CapabilityGuard implements CanActivate {
  constructor(private readonly reflector: Reflector = new Reflector()) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const capability = this.reflector.getAllAndOverride<Capability | undefined>(
      CAPABILITY_METADATA,
      [context.getHandler(), context.getClass()],
    );
    if (capability === undefined) {
      logger.error("api.guard.capability.undeclared", {
        controller: context.getClass().name,
        handler: context.getHandler().name,
      });
      throw new AppError("FORBIDDEN", "You don't have permission to do that");
    }
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    request.user = await runWithRequestContext(request, () => requireCapability(capability));
    return true;
  }
}
