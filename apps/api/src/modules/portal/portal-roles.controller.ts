import { Body, Controller, Inject, Post, UseGuards } from "@nestjs/common";
import {
  postPortalRoleSchema,
  type PostPortalRoleResponse,
} from "@destaworks/contracts/validation/portal";
import type { PortalContext } from "@destaworks/auth/portal-guards";
import { CurrentPortalContact } from "../../common/decorators/current-portal-contact.decorator";
import { PortalAuthGuard } from "../../common/guards/portal-auth.guard";
import { ZodValidationPipe, type ContractOutput } from "../../common/pipes/zod-validation.pipe";
import { CLIENT_PORTAL_SERVICE } from "./portal.tokens";
import type { ServiceOf } from "../service-token";

/**
 * The client portal's role-posting endpoint, ported from `apps/web/src/app/api/portal/roles`.
 *
 * This is the one controller in the area whose callers are OUTSIDE the company, and it is guarded
 * differently from every other one on purpose:
 *
 *  - `PortalAuthGuard` only. Never `SessionAuthGuard`, and never both — a client contact is not one
 *    of the six internal roles, holds no capability, and must not be resolvable as an operator.
 *  - Identity comes from `@CurrentPortalContact()`, which reads what the guard put on the request
 *    from the token COOKIE. `clientId` and `postedByContactId` are set from that context inside the
 *    service; the request body cannot name either, which is the legacy `portal_data` IDOR closed.
 *  - The guard re-checks the contact on EVERY request, so a contact whose CRM status is `left`, or
 *    whose `portalEnabled` is false, is refused while still holding a live, unexpired token.
 */
@Controller("portal")
@UseGuards(PortalAuthGuard)
export class PortalRolesController {
  constructor(
    @Inject(CLIENT_PORTAL_SERVICE) private readonly portal: ServiceOf<typeof CLIENT_PORTAL_SERVICE>,
  ) {}

  /**
   * POST /portal/roles — a client posts an open role. 201.
   *
   * The response is `{ role: { id } }` and deliberately does NOT reuse the internal role envelope:
   * an external audience gets the id it needs to keep going, and a field added to the internal DTO
   * later cannot widen what leaves through here.
   */
  @Post("roles")
  async postRole(
    @Body(new ZodValidationPipe(postPortalRoleSchema))
    body: ContractOutput<typeof postPortalRoleSchema>,
    @CurrentPortalContact() contact: PortalContext,
  ): Promise<PostPortalRoleResponse> {
    const role = await this.portal.postRole(contact, body);
    return { role: { id: role.id } };
  }
}
