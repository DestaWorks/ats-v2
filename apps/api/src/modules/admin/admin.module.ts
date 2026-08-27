import { Module } from "@nestjs/common";
import { adminUserService } from "@destaworks/application/admin-user.service";
import { accessRequestService } from "@destaworks/application/access-request.service";
import { aiOpsService } from "@destaworks/application/ai-ops.service";
import { provideService, serviceToken } from "../service-token";

export const ADMIN_USER_SERVICE = serviceToken<typeof adminUserService>("ADMIN_USER_SERVICE");
export const ACCESS_REQUEST_SERVICE =
  serviceToken<typeof accessRequestService>("ACCESS_REQUEST_SERVICE");
export const AI_OPS_SERVICE = serviceToken<typeof aiOpsService>("AI_OPS_SERVICE");

/**
 * Back-office administration of the operator app itself: user accounts and roles, requests for
 * access to it, and AI usage/ops. Requests for access to the *client portal* belong to
 * `PortalModule`, which owns that audience.
 *
 * Wiring only until Phase 4.3 adds the controllers: the services are bound to tokens and exported,
 * so a controller injects one instead of importing the singleton and becoming untestable.
 */
@Module({
  providers: [
    provideService(ADMIN_USER_SERVICE, adminUserService),
    provideService(ACCESS_REQUEST_SERVICE, accessRequestService),
    provideService(AI_OPS_SERVICE, aiOpsService),
  ],
  exports: [ADMIN_USER_SERVICE, ACCESS_REQUEST_SERVICE, AI_OPS_SERVICE],
})
export class AdminModule {}
