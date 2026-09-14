import { createParamDecorator, type ExecutionContext } from "@nestjs/common";
import { AppError } from "@destaworks/integrations/http/app-error";
import type { TenantContext } from "@destaworks/domain/tenant";
import type { TenantScopedRequest } from "../guards/authenticated-request";

/**
 * Inject the tenant a `TenantGuard` resolved — `handler(@CurrentTenant() ctx: TenantContext)`.
 *
 * Throws `FORBIDDEN` when nothing put a tenant on the request, mirroring `@CurrentUser()`: a
 * handler annotated but left unguarded refuses the request rather than receiving `undefined` and
 * running unscoped. That failure mode is the one this whole phase exists to prevent, so it is a
 * denial and not a `null`.
 */
export const CurrentTenant = createParamDecorator(
  (_data: unknown, context: ExecutionContext): TenantContext => {
    const { tenant } = context.switchToHttp().getRequest<TenantScopedRequest>();
    if (!tenant) throw new AppError("FORBIDDEN", "You don't have access to that workspace");
    return tenant;
  },
);
