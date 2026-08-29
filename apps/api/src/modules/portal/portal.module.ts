import { Module } from "@nestjs/common";
import { clientPortalService } from "@destaworks/application/client-portal.service";
import { portalAccessRequestService } from "@destaworks/application/portal-access-request.service";
import { provideService } from "../service-token";
import { TenantsModule } from "../tenants/tenants.module";
import { PortalAccessRequestsController } from "./portal-access-requests.controller";
import { PortalDataController } from "./portal-data.controller";
import { PortalRolesController } from "./portal-roles.controller";
import { CLIENT_PORTAL_SERVICE, PORTAL_ACCESS_REQUEST_SERVICE } from "./portal.tokens";

export { CLIENT_PORTAL_SERVICE, PORTAL_ACCESS_REQUEST_SERVICE };

/**
 * The client portal — an EXTERNAL audience. Its callers are client contacts, not operators, so
 * everything here is gated by the portal guards rather than the operator capability model.
 * Requesting portal access lives here too — that one form is public, because a requester holds no
 * token yet; approving those requests is an admin surface over the same service.
 */
@Module({
  imports: [TenantsModule],
  controllers: [PortalAccessRequestsController, PortalDataController, PortalRolesController],
  providers: [
    provideService(CLIENT_PORTAL_SERVICE, clientPortalService),
    provideService(PORTAL_ACCESS_REQUEST_SERVICE, portalAccessRequestService),
  ],
  exports: [CLIENT_PORTAL_SERVICE, PORTAL_ACCESS_REQUEST_SERVICE],
})
export class PortalModule {}
