import { createParamDecorator, type ExecutionContext } from "@nestjs/common";
import { AppError } from "@destaworks/integrations/http/app-error";
import type { AuthUser } from "@destaworks/auth/guards";
import type { AuthenticatedRequest } from "../guards/authenticated-request";

/**
 * Inject the signed-in user a `SessionAuthGuard` resolved — `handler(@CurrentUser() user: AuthUser)`.
 *
 * Throws `UNAUTHORIZED` when nothing put a user on the request, so a handler that is annotated but
 * left unguarded refuses the request instead of receiving `undefined` and carrying on.
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthUser => {
    const { user } = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!user) throw new AppError("UNAUTHORIZED", "Sign in required");
    return user;
  },
);
