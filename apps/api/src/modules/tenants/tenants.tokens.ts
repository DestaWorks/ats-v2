import { membershipService } from "@destaworks/application/membership.service";
import { platformAdminService } from "@destaworks/application/platform-admin.service";
import { platformImpersonationService } from "@destaworks/application/platform-impersonation.service";
import { platformMetricsService } from "@destaworks/application/platform-metrics.service";
import { publicTenantService } from "@destaworks/application/public-tenant.service";
import { serviceToken } from "../service-token";

/**
 * The tenancy area's injection tokens, kept out of `tenants.module.ts` so the module can import its
 * controllers and the controllers can name the tokens without an ES module cycle.
 *
 * A token per service, not one shared across the area, because these sit on two different axes:
 * `membershipService` acts inside a tenant on behalf of a member, while the three platform
 * services act on the installation. Sharing a token would be the first step toward sharing a
 * guard, and the whole point of 6.8 is that these two authorities never meet.
 */
export const MEMBERSHIP_SERVICE = serviceToken<typeof membershipService>("MEMBERSHIP_SERVICE");
export const PLATFORM_ADMIN_SERVICE =
  serviceToken<typeof platformAdminService>("PLATFORM_ADMIN_SERVICE");
export const PLATFORM_IMPERSONATION_SERVICE = serviceToken<typeof platformImpersonationService>(
  "PLATFORM_IMPERSONATION_SERVICE",
);
export const PLATFORM_METRICS_SERVICE = serviceToken<typeof platformMetricsService>(
  "PLATFORM_METRICS_SERVICE",
);

/**
 * Resolving a workspace for an UNAUTHENTICATED caller, from the host their browser used. Its own
 * token because it grants nothing: it verifies a workspace exists and is usable and hands back a
 * scoping-only context, which is all a public endpoint may ever be given.
 */
export const PUBLIC_TENANT_SERVICE =
  serviceToken<typeof publicTenantService>("PUBLIC_TENANT_SERVICE");
