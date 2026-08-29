import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import {
  grantSupportWindowSchema,
  type DeleteSupportWindowResponse,
  type GetImpersonatedActivityResponse,
  type GetSupportWindowResponse,
  type PostSupportWindowResponse,
} from "@destaworks/contracts/validation/platform-impersonation";
import type { TenantContext } from "@destaworks/domain/tenant";
import type { AuthUser } from "@destaworks/auth/guards";
import { CurrentTenant } from "../../common/decorators/current-tenant.decorator";
import { CurrentIdentity } from "../../common/decorators/current-identity.decorator";
import { PlatformAuthGuard } from "../../common/guards/platform-auth.guard";
import { SessionAuthGuard } from "../../common/guards/session-auth.guard";
import { TenantGuard } from "../../common/guards/tenant.guard";
import { ZodValidationPipe, type ContractOutput } from "../../common/pipes/zod-validation.pipe";
import type { ServiceOf } from "../service-token";
import { PLATFORM_IMPERSONATION_SERVICE } from "./tenants.tokens";

/**
 * Support impersonation (SAAS-RESTRUCTURE-PLAN Phase 8) — transport only.
 *
 * ── Why one controller carries routes on two different axes ────────────────────────────────────
 *
 * Consent and the crossing it authorizes are one feature and belong in one file, but they are not
 * one authority, so the guards differ per route rather than per controller — the same shape
 * `TenantsController` uses, for the same reason.
 *
 * The `consent` routes carry `TenantGuard`: a workspace granting or withdrawing its own consent is
 * acting INSIDE itself, and the role that decides whether it may is the membership's, which only
 * `TenantContext` carries. The read route carries `PlatformAuthGuard`, because a platform
 * admin belongs to no tenant and `TenantGuard` would refuse exactly the person the route is for.
 *
 * ── Why no `@RequireCapability` on any of them ─────────────────────────────────────────────────
 *
 * On the consent routes, `CapabilityGuard` resolves the role from the SESSION user, while the role
 * that governs consent is the membership's — declaring it here would check a different role from
 * the one the service enforces, and the weaker one first. On the read route a platform capability
 * is not even expressible: the decorator takes the tenant `Capability` union. Both gates therefore
 * live in the service, in the same call that writes the audit row, so an authorized crossing and
 * its record cannot come apart.
 */
@Controller("platform/impersonation")
export class PlatformImpersonationController {
  constructor(
    @Inject(PLATFORM_IMPERSONATION_SERVICE)
    private readonly impersonation: ServiceOf<typeof PLATFORM_IMPERSONATION_SERVICE>,
  ) {}

  /** GET /platform/impersonation/consent — is anyone from the platform able to see us right now? */
  @Get("consent")
  @UseGuards(SessionAuthGuard, TenantGuard)
  async window(@CurrentTenant() tenant: TenantContext): Promise<GetSupportWindowResponse> {
    return this.impersonation.getSupportWindow(tenant);
  }

  /** POST /platform/impersonation/consent — open a bounded, self-expiring support window. */
  @Post("consent")
  @UseGuards(SessionAuthGuard, TenantGuard)
  async grant(
    @Body(new ZodValidationPipe(grantSupportWindowSchema))
    body: ContractOutput<typeof grantSupportWindowSchema>,
    @CurrentTenant() tenant: TenantContext,
  ): Promise<PostSupportWindowResponse> {
    return this.impersonation.grantSupportWindow(tenant, body);
  }

  /** DELETE /platform/impersonation/consent — withdraw it, effective on the next request. */
  @Delete("consent")
  @UseGuards(SessionAuthGuard, TenantGuard)
  async revoke(@CurrentTenant() tenant: TenantContext): Promise<DeleteSupportWindowResponse> {
    return this.impersonation.revokeSupportWindow(tenant);
  }

  /**
   * GET /platform/impersonation/:slug/activity — the audited, consented, time-boxed crossing.
   *
   * The slug is the only thing the client contributes. Consent, the time box and the platform
   * capability are all read server-side, on this request, from state the caller cannot author.
   */
  @Get(":slug/activity")
  @UseGuards(PlatformAuthGuard)
  async activity(
    @Param("slug") slug: string,
    @CurrentIdentity() user: AuthUser,
    @Query("cursor") cursor?: string,
  ): Promise<GetImpersonatedActivityResponse> {
    return this.impersonation.readActivityAsTenant(user, slug, cursor ?? null);
  }
}
