import { Module } from "@nestjs/common";
import { clientPortalService } from "@destaworks/application/client-portal.service";
import { portalAccessRequestService } from "@destaworks/application/portal-access-request.service";
import { provideService, serviceToken } from "../service-token";

export const CLIENT_PORTAL_SERVICE =
  serviceToken<typeof clientPortalService>("CLIENT_PORTAL_SERVICE");
export const PORTAL_ACCESS_REQUEST_SERVICE = serviceToken<typeof portalAccessRequestService>(
  "PORTAL_ACCESS_REQUEST_SERVICE",
);

/**
 * The client portal — an EXTERNAL audience. Its callers are client contacts, not operators, so
 * everything here is gated by the portal guards rather than the operator capability model.
 * Requesting portal access lives here too; approving those requests is an admin surface over
 * the same service.
 *
 * Wiring only until Phase 4.3 adds the controllers: the services are bound to tokens and exported,
 * so a controller injects one instead of importing the singleton and becoming untestable.
 */
@Module({
  providers: [
    provideService(CLIENT_PORTAL_SERVICE, clientPortalService),
    provideService(PORTAL_ACCESS_REQUEST_SERVICE, portalAccessRequestService),
  ],
  exports: [CLIENT_PORTAL_SERVICE, PORTAL_ACCESS_REQUEST_SERVICE],
})
export class PortalModule {}
