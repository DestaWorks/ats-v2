import { Injectable, type CanActivate, type ExecutionContext } from "@nestjs/common";
import { requirePortalContact } from "@destaworks/auth/portal-guards";
import { runWithRequestContext } from "../request-context/nest-request-context";
import type { PortalRequest } from "./authenticated-request";

/**
 * Authenticates an external client contact from the `portal_token` cookie and attaches the result
 * as `request.portal`. The Nest port of `requirePortalContact()` — 401 when the cookie is absent,
 * unknown, revoked or expired.
 *
 * A separate guard from `SessionAuthGuard`, and deliberately never merged with it: a portal contact
 * is not one of the six internal roles and holds no capability, so there is nothing for the two to
 * share except a mistake. Delegating to `requirePortalContact` keeps the refusals that matter in
 * one place — a contact whose CRM `status` is `left`, and one whose `portalEnabled` is false, are
 * both refused on every request even while their token is still live, so revoking portal access is
 * a CRM edit rather than a token hunt.
 */
@Injectable()
export class PortalAuthGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<PortalRequest>();
    request.portal = await runWithRequestContext(request, () => requirePortalContact());
    return true;
  }
}
