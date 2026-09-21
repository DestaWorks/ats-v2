import { Controller, Get, Inject, Query, UseGuards } from "@nestjs/common";
import {
  platformMetricsQuerySchema,
  type GetPlatformMetricsResponse,
} from "@destaworks/contracts/validation/platform-metrics";
import type { AuthUser } from "@destaworks/auth/guards";
import { CurrentIdentity } from "../../common/decorators/current-identity.decorator";
import { PlatformAuthGuard } from "../../common/guards/platform-auth.guard";
import { ZodValidationPipe, type ContractOutput } from "../../common/pipes/zod-validation.pipe";
import type { ServiceOf } from "../service-token";
import { PLATFORM_METRICS_SERVICE } from "./tenants.tokens";

/**
 * The installation's own metrics (SAAS-RESTRUCTURE-PLAN Phase 8).
 *
 * ── Why this is not under `/reports`, and never will be ───────────────────────────────────────
 *
 * Phase 8 requires platform metrics to be separate from any tenant's reports, and a shared route
 * prefix is the first way that separation erodes. `/reports/*` is tenant surface: `TenantGuard`
 * puts the request inside one workspace and a tenant `Capability` decides what it may see.
 * Nothing on that surface can reach this controller, and this controller reaches nothing on it.
 *
 * ── Why there is no `TenantGuard` and no `@RequireCapability` ─────────────────────────────────
 *
 * The same reason `PlatformTenantsController` has neither. `TenantGuard` would refuse a platform
 * admin who belongs to no tenant, which is the normal case; `@RequireCapability` takes the tenant
 * capability union, so a platform capability cannot even be spelled there. Authentication stops at
 * `SessionAuthGuard`; authorization is `requirePlatformCapability` inside the service, where the
 * decision sits next to the read it is about.
 *
 * The controller is transport only: it validates the window, passes the authenticated user
 * through, and returns what the service composed. It holds no repository and no query.
 */
@Controller("platform/metrics")
@UseGuards(PlatformAuthGuard)
export class PlatformMetricsController {
  constructor(
    @Inject(PLATFORM_METRICS_SERVICE)
    private readonly metrics: ServiceOf<typeof PLATFORM_METRICS_SERVICE>,
  ) {}

  /** GET /platform/metrics — installation-wide totals. Names no tenant and no person. */
  @Get()
  async read(
    @Query(new ZodValidationPipe(platformMetricsQuerySchema))
    query: ContractOutput<typeof platformMetricsQuerySchema>,
    @CurrentIdentity() user: AuthUser,
  ): Promise<GetPlatformMetricsResponse> {
    return await this.metrics.readMetrics(user, query);
  }
}
