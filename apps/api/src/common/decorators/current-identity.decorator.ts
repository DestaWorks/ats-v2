import { createParamDecorator, type ExecutionContext } from "@nestjs/common";
import { AppError } from "@destaworks/integrations/http/app-error";
import type { AuthUser } from "@destaworks/auth/guards";
import type { PlatformRequest } from "../guards/authenticated-request";

/**
 * Inject the identity `IdentityAuthGuard` authenticated — `handler(@CurrentIdentity() user: AuthUser)`.
 *
 * Deliberately not `@CurrentUser()`: that one returns an `AuthContext`, which carries a tenant and
 * a role. An identity carries neither, and keeping them separate types is what stops a platform
 * handler being handed something a tenant-scoped repository would accept.
 */
export const CurrentIdentity = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthUser => {
    const { identity } = context.switchToHttp().getRequest<PlatformRequest>();
    if (!identity) throw new AppError("UNAUTHORIZED", "Sign in required");
    return identity;
  },
);
