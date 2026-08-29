import { Module } from "@nestjs/common";
import { membershipService } from "@destaworks/application/membership.service";
import { platformAdminService } from "@destaworks/application/platform-admin.service";
import { provideService } from "../service-token";
import { PlatformTenantsController } from "./platform-tenants.controller";
import { TenantsController } from "./tenants.controller";
import { MEMBERSHIP_SERVICE, PLATFORM_ADMIN_SERVICE } from "./tenants.tokens";

export { MEMBERSHIP_SERVICE, PLATFORM_ADMIN_SERVICE };

/**
 * Tenancy: which workspace a request is acting in, who belongs to it, and — on a separate axis —
 * the platform plane that operates the installation itself (SAAS-RESTRUCTURE-PLAN 6.5/6.8).
 *
 * The two controllers share a module because they are one area of the domain, and share nothing
 * else: no guard, no service, and no capability vocabulary. That is deliberate. Splitting them
 * into two modules would suggest the separation is about wiring, when it is about authority.
 */
@Module({
  controllers: [TenantsController, PlatformTenantsController],
  providers: [
    provideService(MEMBERSHIP_SERVICE, membershipService),
    provideService(PLATFORM_ADMIN_SERVICE, platformAdminService),
  ],
  exports: [MEMBERSHIP_SERVICE, PLATFORM_ADMIN_SERVICE],
})
export class TenantsModule {}
