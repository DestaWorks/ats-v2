import { Body, Controller, Get, Inject, Param, Post, UseGuards } from "@nestjs/common";
import {
  suspendTenantSchema,
  type GetPlatformTenantResponse,
  type GetPlatformTenantsResponse,
  type PostPlatformTenantRestoreResponse,
  type PostPlatformTenantSuspendResponse,
} from "@destaworks/contracts/validation/tenant";
import type { AuthUser } from "@destaworks/auth/guards";
import { CurrentIdentity } from "../../common/decorators/current-identity.decorator";
import { PlatformAuthGuard } from "../../common/guards/platform-auth.guard";
import { ZodValidationPipe, type ContractOutput } from "../../common/pipes/zod-validation.pipe";
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
@UseGuards(PlatformAuthGuard)
export class PlatformTenantsController {
  constructor(
    @Inject(PLATFORM_ADMIN_SERVICE)
    private readonly platform: ServiceOf<typeof PLATFORM_ADMIN_SERVICE>,
  ) {}

  /** GET /platform/tenants — the tenant registry. Metadata only; no tenant's contents. */
  @Get()
  async list(@CurrentIdentity() user: AuthUser): Promise<GetPlatformTenantsResponse> {
    return this.platform.listTenants(user);
  }

  /** GET /platform/tenants/:slug — read one workspace from outside it. Audited into that tenant. */
  @Get(":slug")
  async read(
    @Param("slug") slug: string,
    @CurrentIdentity() user: AuthUser,
  ): Promise<GetPlatformTenantResponse> {
    return this.platform.readTenant(user, slug);
  }

  /**
   * POST /platform/tenants/:slug/suspend — take a workspace offline for everyone in it.
   *
   * A sub-path rather than a `PATCH` of the tenant's `status`, because these are two operations
   * with two different meanings and one of them derives the status it restores. Exposing the
   * column would invite a caller to set `active` on a suspended trial and quietly change what the
   * customer is on.
   */
  @Post(":slug/suspend")
  async suspend(
    @Param("slug") slug: string,
    @Body(new ZodValidationPipe(suspendTenantSchema))
    body: ContractOutput<typeof suspendTenantSchema>,
    @CurrentIdentity() user: AuthUser,
  ): Promise<PostPlatformTenantSuspendResponse> {
    return this.platform.suspendTenant(user, slug, body);
  }

  /** POST /platform/tenants/:slug/restore — lift a suspension. No body: the service derives the
   *  status to return to from the tenant's own trial dates. */
  @Post(":slug/restore")
  async restore(
    @Param("slug") slug: string,
    @CurrentIdentity() user: AuthUser,
  ): Promise<PostPlatformTenantRestoreResponse> {
    return this.platform.restoreTenant(user, slug);
  }
}
