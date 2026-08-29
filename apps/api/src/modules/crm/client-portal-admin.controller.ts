import { Controller, Get, HttpCode, Inject, Param, Post, UseGuards } from "@nestjs/common";
import type {
  GetCrmPortalContactsResponse,
  PostCrmPortalTokenResponse,
  PostCrmPortalTokenRevokeResponse,
} from "@destaworks/contracts/http/crm";
import type { AuthContext } from "@destaworks/auth/guards";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { RequireCapability } from "../../common/decorators/require-capability.decorator";
import { CapabilityGuard } from "../../common/guards/capability.guard";
import { SessionAuthGuard } from "../../common/guards/session-auth.guard";
import type { ServiceOf } from "../service-token";
import { CLIENT_PORTAL_SERVICE } from "../portal/portal.module";

/**
 * The operator side of the client portal: who has a link, minting one, and killing one.
 *
 * Gated `configureClientPortal`, which is stricter than the `viewCrm` the rest of this module
 * uses — these handlers manage credentials that expose PHI to people outside the company, so
 * "can see the CRM" is not the same permission as "can hand out access to it".
 */
@Controller("crm/clients/:id/portal")
@UseGuards(SessionAuthGuard, CapabilityGuard)
@RequireCapability("configureClientPortal")
export class CrmClientPortalAdminController {
  constructor(
    @Inject(CLIENT_PORTAL_SERVICE)
    private readonly portal: ServiceOf<typeof CLIENT_PORTAL_SERVICE>,
  ) {}

  @Get("contacts")
  async listContacts(
    @Param("id") clientId: string,
    @CurrentUser() user: AuthContext,
  ): Promise<GetCrmPortalContactsResponse> {
    return { contacts: await this.portal.listContactsForClient(clientId, user) };
  }

  @Post("contacts/:contactId/tokens")
  async generateLink(
    @Param("id") clientId: string,
    @Param("contactId") contactId: string,
    @CurrentUser() user: AuthContext,
  ): Promise<PostCrmPortalTokenResponse> {
    return this.portal.generateLink(clientId, contactId, user);
  }

  @Post("tokens/:tokenId/revoke")
  @HttpCode(200)
  async revokeLink(
    @Param("id") clientId: string,
    @Param("tokenId") tokenId: string,
    @CurrentUser() user: AuthContext,
  ): Promise<PostCrmPortalTokenRevokeResponse> {
    await this.portal.revokeLink(clientId, tokenId, user);
    return { ok: true, id: tokenId };
  }
}
