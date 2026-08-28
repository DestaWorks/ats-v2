import { Module } from "@nestjs/common";
import { adminUserService } from "@destaworks/application/admin-user.service";
import { accessRequestService } from "@destaworks/application/access-request.service";
import { aiOpsService } from "@destaworks/application/ai-ops.service";
import { provideService } from "../service-token";
import { PortalModule } from "../portal/portal.module";
import { AdminAccessRequestsController } from "./admin-access-requests.controller";
import { AdminAiController } from "./admin-ai.controller";
import { AdminPortalRequestsController } from "./admin-portal-requests.controller";
import { AdminUsersController } from "./admin-users.controller";
import { ACCESS_REQUEST_SERVICE, ADMIN_USER_SERVICE, AI_OPS_SERVICE } from "./admin.tokens";

export { ACCESS_REQUEST_SERVICE, ADMIN_USER_SERVICE, AI_OPS_SERVICE };

/**
 * Back-office administration of the operator app itself: user accounts and roles, requests for
 * access to it, and AI usage/ops.
 *
 * The admin view of CLIENT PORTAL access requests is served here too — its callers are operators —
 * but the service behind it stays in `PortalModule`, which owns that audience. `PortalModule` is
 * imported for the token rather than the service being registered twice.
 */
@Module({
  imports: [PortalModule],
  controllers: [
    AdminUsersController,
    AdminAccessRequestsController,
    AdminAiController,
    AdminPortalRequestsController,
  ],
  providers: [
    provideService(ADMIN_USER_SERVICE, adminUserService),
    provideService(ACCESS_REQUEST_SERVICE, accessRequestService),
    provideService(AI_OPS_SERVICE, aiOpsService),
  ],
  exports: [ADMIN_USER_SERVICE, ACCESS_REQUEST_SERVICE, AI_OPS_SERVICE],
})
export class AdminModule {}
