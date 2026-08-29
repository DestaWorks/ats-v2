import { membershipService } from "@destaworks/application/membership.service";
import { platformAdminService } from "@destaworks/application/platform-admin.service";
import { serviceToken } from "../service-token";

/**
 * The tenancy area's injection tokens, kept out of `tenants.module.ts` so the module can import its
 * controllers and the controllers can name the tokens without an ES module cycle.
 *
 * Two tokens, not one, because the two services sit on different axes: `membershipService` acts
 * inside a tenant on behalf of a member, `platformAdminService` acts on the installation. Sharing
 * a token would be the first step toward sharing a guard.
 */
export const MEMBERSHIP_SERVICE = serviceToken<typeof membershipService>("MEMBERSHIP_SERVICE");
export const PLATFORM_ADMIN_SERVICE =
  serviceToken<typeof platformAdminService>("PLATFORM_ADMIN_SERVICE");
