import { createParamDecorator, type ExecutionContext } from "@nestjs/common";
import { AppError } from "@destaworks/integrations/http/app-error";
import type { AuthContext } from "@destaworks/auth/guards";
import type { AuthenticatedRequest } from "../guards/authenticated-request";

/**
 * Inject the context a guard resolved — `handler(@CurrentUser() user: AuthContext)`.
 *
 * It carries the tenant, the membership and that membership's role alongside the identity, so a
 * controller never resolves any of them and a service is handed the whole context in one
 * argument. Throws `UNAUTHORIZED` when nothing put a context on the request, so a handler that is
 * annotated but left unguarded refuses the request instead of receiving `undefined` and carrying
 * on.
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthContext => {
    const { user } = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!user) throw new AppError("UNAUTHORIZED", "Sign in required");
    return user;
  },
);
