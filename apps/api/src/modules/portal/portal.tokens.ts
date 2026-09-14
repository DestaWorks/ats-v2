import { clientPortalService } from "@destaworks/application/client-portal.service";
import { portalAccessRequestService } from "@destaworks/application/portal-access-request.service";
import { serviceToken } from "../service-token";

/**
 * The portal area's injection tokens, kept out of `portal.module.ts` so the module can import its
 * controllers and a controller can name a token without an ES module cycle — `@Inject` evaluates at
 * class-definition time, so a cycle here is a boot-time ReferenceError, not a warning.
 */
export const CLIENT_PORTAL_SERVICE =
  serviceToken<typeof clientPortalService>("CLIENT_PORTAL_SERVICE");

export const PORTAL_ACCESS_REQUEST_SERVICE = serviceToken<typeof portalAccessRequestService>(
  "PORTAL_ACCESS_REQUEST_SERVICE",
);
