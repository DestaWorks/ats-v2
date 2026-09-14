import { createParamDecorator, type ExecutionContext } from "@nestjs/common";
import { AppError } from "@destaworks/integrations/http/app-error";
import type { PortalContext } from "@destaworks/auth/portal-guards";
import type { PortalRequest } from "../guards/authenticated-request";

/**
 * Inject the portal contact a `PortalAuthGuard` resolved —
 * `handler(@CurrentPortalContact() contact: PortalContext)`.
 *
 * The identity comes from the request, which the guard populated from the token cookie. It is never
 * read from a body or query parameter — that is the legacy IDOR (`portal_data` trusted a
 * client-supplied email) this whole surface exists to close. Throws `UNAUTHORIZED` when unguarded.
 */
export const CurrentPortalContact = createParamDecorator(
  (_data: unknown, context: ExecutionContext): PortalContext => {
    const { portal } = context.switchToHttp().getRequest<PortalRequest>();
    if (!portal) throw new AppError("UNAUTHORIZED", "Portal link is invalid or has expired");
    return portal;
  },
);
