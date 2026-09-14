import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import {
  upsertAccessRoleSchema,
  type GetTenantRolesResponse,
  type TenantRoleResponse,
} from "@destaworks/contracts/validation/tenant";
import type { TenantContext } from "@destaworks/domain/tenant";
import { CurrentTenant } from "../../common/decorators/current-tenant.decorator";
import { SessionAuthGuard } from "../../common/guards/session-auth.guard";
import { TenantGuard } from "../../common/guards/tenant.guard";
import { ZodValidationPipe, type ContractOutput } from "../../common/pipes/zod-validation.pipe";
import type { ServiceOf } from "../service-token";
import { ACCESS_ROLE_SERVICE } from "./tenants.tokens";

/**
 * The role editor's surface: a workspace defining what its own roles may do.
 *
 * No `@RequireCapability`, for the same reason as `TenantsController` — the gate lives in
 * `accessRoleService` beside the audit row each call writes. Every other endpoint SPENDS authority;
 * these four define it, so read that service's guards before changing anything here.
 */
@Controller("tenants/roles")
@UseGuards(SessionAuthGuard, TenantGuard)
export class AccessRolesController {
  constructor(
    @Inject(ACCESS_ROLE_SERVICE) private readonly roles: ServiceOf<typeof ACCESS_ROLE_SERVICE>,
  ) {}

  /** GET /tenants/roles — every role this workspace owns, what it grants, and who holds it. */
  @Get()
  async list(@CurrentTenant() tenant: TenantContext): Promise<GetTenantRolesResponse> {
    return this.roles.list(tenant);
  }

  /** POST /tenants/roles — a new role, cloned from a template by the client. */
  @Post()
  async create(
    @Body(new ZodValidationPipe(upsertAccessRoleSchema))
    body: ContractOutput<typeof upsertAccessRoleSchema>,
    @CurrentTenant() tenant: TenantContext,
  ): Promise<TenantRoleResponse> {
    return this.roles.create(tenant, body);
  }

  /** PATCH /tenants/roles/:roleId — rename, or change what it grants. Built-ins included. */
  @Patch(":roleId")
  async update(
    @Param("roleId") roleId: string,
    @Body(new ZodValidationPipe(upsertAccessRoleSchema))
    body: ContractOutput<typeof upsertAccessRoleSchema>,
    @CurrentTenant() tenant: TenantContext,
  ): Promise<TenantRoleResponse> {
    return this.roles.update(tenant, roleId, body);
  }

  /** DELETE /tenants/roles/:roleId — custom roles nobody holds. */
  @Delete(":roleId")
  async remove(
    @Param("roleId") roleId: string,
    @CurrentTenant() tenant: TenantContext,
  ): Promise<{ id: string }> {
    return this.roles.remove(tenant, roleId);
  }
}
