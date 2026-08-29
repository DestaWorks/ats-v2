import { Controller, Get, Inject, Param, UseGuards } from "@nestjs/common";
import type {
  GetPlatformTenantResponse,
  GetPlatformTenantsResponse,
} from "@destaworks/contracts/validation/tenant";
import type { AuthUser } from "@destaworks/auth/guards";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { SessionAuthGuard } from "../../common/guards/session-auth.guard";
import type { ServiceOf } from "../service-token";
import { PLATFORM_ADMIN_SERVICE } from "./tenants.tokens";

/**
 * The platform plane's read surface (SAAS-RESTRUCTURE-PLAN 6.8).
 *
 * ── Why there is no `TenantGuard` here, and no `@RequireCapability` ────────────────────────────
 *
 * Both would be category errors. `TenantGuard` puts a request INSIDE one workspace; these routes
 * are about the installation and would be refused by it for a platform admin who happens to belong
 * to no tenant at all. `@RequireCapability` takes the tenant `Capability` union, so a platform
 * capability is not even expressible there — which is the type system stating 6.8's rule: the two
 * axes do not share a vocabulary, and no tenant role value can reach across.
 *
 * Authentication is the transport's job and stops at `SessionAuthGuard`. Authorization is
 * `requirePlatformCapability` inside `platformAdminService`, in the same call that writes the
 * audit row — so an authorized crossing and its record cannot come apart.
 */
@Controller("platform/tenants")
@UseGuards(SessionAuthGuard)
export class PlatformTenantsController {
  constructor(
    @Inject(PLATFORM_ADMIN_SERVICE)
    private readonly platform: ServiceOf<typeof PLATFORM_ADMIN_SERVICE>,
  ) {}

  /** GET /platform/tenants — the tenant registry. Metadata only; no tenant's contents. */
  @Get()
  async list(@CurrentUser() user: AuthUser): Promise<GetPlatformTenantsResponse> {
    return this.platform.listTenants(user);
  }

  /** GET /platform/tenants/:slug — read one workspace from outside it. Audited into that tenant. */
  @Get(":slug")
  async read(
    @Param("slug") slug: string,
    @CurrentUser() user: AuthUser,
  ): Promise<GetPlatformTenantResponse> {
    return this.platform.readTenant(user, slug);
  }
}
