import { Module } from "@nestjs/common";
import { clientPortalService } from "@destaworks/application/client-portal.service";
import { portalAccessRequestService } from "@destaworks/application/portal-access-request.service";
import { provideService } from "../service-token";
import { PortalDataController } from "./portal-data.controller";
import { PortalRolesController } from "./portal-roles.controller";
import { CLIENT_PORTAL_SERVICE, PORTAL_ACCESS_REQUEST_SERVICE } from "./portal.tokens";

export { CLIENT_PORTAL_SERVICE, PORTAL_ACCESS_REQUEST_SERVICE };

/**
 * The client portal — an EXTERNAL audience. Its callers are client contacts, not operators, so
 * everything here is gated by the portal guards rather than the operator capability model.
 * Requesting portal access lives here too; approving those requests is an admin surface over
 * the same service.
 */
@Module({
  controllers: [PortalDataController, PortalRolesController],
  providers: [
    provideService(CLIENT_PORTAL_SERVICE, clientPortalService),
    provideService(PORTAL_ACCESS_REQUEST_SERVICE, portalAccessRequestService),
  ],
  exports: [CLIENT_PORTAL_SERVICE, PORTAL_ACCESS_REQUEST_SERVICE],
})
export class PortalModule {}
