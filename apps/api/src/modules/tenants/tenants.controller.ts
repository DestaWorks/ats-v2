import { Body, Controller, Delete, Get, Inject, Param, Post, Res, UseGuards } from "@nestjs/common";
import {
  acceptInvitationSchema,
  inviteMemberSchema,
  switchTenantSchema,
  type DeleteTenantMemberResponse,
  type GetTenantMembersResponse,
  type GetTenantsResponse,
  type PostTenantMemberAcceptResponse,
  type PostTenantMemberResponse,
  type PostTenantSwitchResponse,
} from "@destaworks/contracts/validation/tenant";
import { TENANT_COOKIE } from "@destaworks/domain/constants";
import type { TenantContext } from "@destaworks/domain/tenant";
import type { AuthUser } from "@destaworks/auth/guards";
import { CurrentTenant } from "../../common/decorators/current-tenant.decorator";
import { CurrentIdentity } from "../../common/decorators/current-identity.decorator";
import { IdentityAuthGuard } from "../../common/guards/identity-auth.guard";
import { SessionAuthGuard } from "../../common/guards/session-auth.guard";
import { TenantGuard } from "../../common/guards/tenant.guard";
import { ZodValidationPipe, type ContractOutput } from "../../common/pipes/zod-validation.pipe";
import type { ServiceOf } from "../service-token";
import { MEMBERSHIP_SERVICE } from "./tenants.tokens";

/** The one response capability the switch needs; Express's `res.cookie` satisfies it. */
export interface CookieResponseLike {
  cookie(name: string, value: string, options: Record<string, unknown>): unknown;
}

/**
 * How long the remembered active tenant survives without being renewed. A month: long enough that
 * a returning user lands where they left off, short enough that a shared or forgotten browser
 * stops volunteering a workspace name. Nothing depends on it for security — the cookie is
 * re-verified against a membership on every request, so its expiry only affects convenience.
 */
const TENANT_COOKIE_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

/**
 * Workspace membership from the member's side: which workspaces am I in, which one am I in now,
 * and — with `manageUsers` — who else is in this one (SAAS-RESTRUCTURE-PLAN 6.5).
 *
 * ── Why the guards differ per route ────────────────────────────────────────────────────────────
 *
 * The first three routes carry `IdentityAuthGuard` — identity, no tenant — on purpose. Listing
 * your workspaces,
 * switching between them, and accepting an invitation are all things you do when you are not yet
 * in a tenant — a `TenantGuard` on them would refuse exactly the person who needs them, and would
 * make a fresh invitee unable to accept the invitation that would give them access.
 *
 * The member-management routes add `TenantGuard`, because they act inside one workspace.
 *
 * ── Why no `@RequireCapability` ────────────────────────────────────────────────────────────────
 *
 * `CapabilityGuard` resolves the role through `requireCapability()`, which reads the SESSION user.
 * The role that governs member management is the MEMBERSHIP's, which only `TenantContext` carries.
 * Declaring a capability here would therefore check a different role from the one the service
 * enforces — two answers to one question, and the weaker one first. So the gate lives in
 * `membershipService`, once, next to the audit row it produces. Same pattern, same reason, as
 * `ClientMatchProfilesController`.
 */
@Controller("tenants")
export class TenantsController {
  constructor(
    @Inject(MEMBERSHIP_SERVICE) private readonly memberships: ServiceOf<typeof MEMBERSHIP_SERVICE>,
  ) {}

  /** GET /tenants — the workspaces this user may switch into, plus open invitations. */
  @Get()
  @UseGuards(IdentityAuthGuard)
  async list(@CurrentIdentity() user: AuthUser): Promise<GetTenantsResponse> {
    return this.memberships.listForUser(user);
  }

  /**
   * POST /tenants/switch — make a workspace the active one.
   *
   * The cookie is written only after the service has verified the membership, and the value
   * written is the slug the SERVER resolved, never the string the client sent. A client that names
   * a workspace it has no active membership in gets a 403 and no `Set-Cookie` at all.
   */
  @Post("switch")
  @UseGuards(IdentityAuthGuard)
  async switch(
    @Body(new ZodValidationPipe(switchTenantSchema))
    body: ContractOutput<typeof switchTenantSchema>,
    @CurrentIdentity() user: AuthUser,
    @Res({ passthrough: true }) response: CookieResponseLike,
  ): Promise<PostTenantSwitchResponse> {
    const result = await this.memberships.switchTenant(user, body);
    response.cookie(TENANT_COOKIE, result.tenant.slug, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: TENANT_COOKIE_MAX_AGE_SECONDS * 1000,
    });
    return result;
  }

  /** POST /tenants/members/accept — accept your own invitation. Declared before `members`. */
  @Post("members/accept")
  @UseGuards(IdentityAuthGuard)
  async accept(
    @Body(new ZodValidationPipe(acceptInvitationSchema))
    body: ContractOutput<typeof acceptInvitationSchema>,
    @CurrentIdentity() user: AuthUser,
  ): Promise<PostTenantMemberAcceptResponse> {
    return this.memberships.acceptInvitation(user, body);
  }

  /** GET /tenants/members — the active workspace's roster. */
  @Get("members")
  @UseGuards(SessionAuthGuard, TenantGuard)
  async members(@CurrentTenant() tenant: TenantContext): Promise<GetTenantMembersResponse> {
    return this.memberships.listMembers(tenant);
  }

  /** POST /tenants/members — invite an existing account into the active workspace. */
  @Post("members")
  @UseGuards(SessionAuthGuard, TenantGuard)
  async invite(
    @Body(new ZodValidationPipe(inviteMemberSchema))
    body: ContractOutput<typeof inviteMemberSchema>,
    @CurrentTenant() tenant: TenantContext,
  ): Promise<PostTenantMemberResponse> {
    return this.memberships.invite(tenant, body);
  }

  /** DELETE /tenants/members/:membershipId — revoke access, effective on their next request. */
  @Delete("members/:membershipId")
  @UseGuards(SessionAuthGuard, TenantGuard)
  async remove(
    @Param("membershipId") membershipId: string,
    @CurrentTenant() tenant: TenantContext,
  ): Promise<DeleteTenantMemberResponse> {
    return this.memberships.remove(tenant, membershipId);
  }
}
