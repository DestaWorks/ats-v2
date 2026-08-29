import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import {
  banUserSchema,
  createUserSchema,
  setRoleSchema,
  type AdminUserEnvelopeDTO,
  type AdminUserListDTO,
  type GeneratedPasswordDTO,
  type ResetPasswordDTO,
} from "@destaworks/contracts/validation/admin";
import type { AcknowledgedIdDTO } from "@destaworks/contracts/api";
import type { AuthContext } from "@destaworks/auth/guards";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { RequireCapability } from "../../common/decorators/require-capability.decorator";
import { CapabilityGuard } from "../../common/guards/capability.guard";
import { SessionAuthGuard } from "../../common/guards/session-auth.guard";
import { ZodValidationPipe, type ContractOutput } from "../../common/pipes/zod-validation.pipe";
import type { ServiceOf } from "../service-token";
import { ADMIN_USER_SERVICE } from "./admin.tokens";

/**
 * Administration of operator accounts: who exists, who is banned, and what role they hold.
 *
 * The capabilities are NOT uniform and must not be made so. Everything that manages an account is
 * `manageUsers`; changing a role is `manageRoles`, because granting yourself or a colleague a role
 * is the one action here that can escalate privilege rather than just remove it. Each route
 * carries its own declaration for that reason — `CapabilityGuard` refuses a handler that declares
 * none, so a forgotten decorator fails closed rather than inheriting the controller's.
 *
 * Every mutation takes the actor's id from the session-resolved user, never from the body, so the
 * audit trail records who really did it.
 */
@Controller("admin/users")
@UseGuards(SessionAuthGuard, CapabilityGuard)
export class AdminUsersController {
  constructor(
    @Inject(ADMIN_USER_SERVICE) private readonly users: ServiceOf<typeof ADMIN_USER_SERVICE>,
  ) {}

  @Get()
  @RequireCapability("manageUsers")
  async list(): Promise<AdminUserListDTO> {
    return await this.users.list();
  }

  /** 201: this creates an account, and returns its one-time password exactly once. */
  @Post()
  @RequireCapability("manageUsers")
  async create(
    @CurrentUser() actor: AuthContext,
    @Body(new ZodValidationPipe(createUserSchema)) body: ContractOutput<typeof createUserSchema>,
  ): Promise<GeneratedPasswordDTO> {
    return await this.users.create(body, actor);
  }

  @Delete(":id")
  @RequireCapability("manageUsers")
  async remove(
    @CurrentUser() actor: AuthContext,
    @Param("id") id: string,
  ): Promise<AcknowledgedIdDTO> {
    await this.users.remove(id, actor);
    return { ok: true, id };
  }

  @Post(":id/ban")
  @HttpCode(200)
  @RequireCapability("manageUsers")
  async ban(
    @CurrentUser() actor: AuthContext,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(banUserSchema)) body: ContractOutput<typeof banUserSchema>,
  ): Promise<AdminUserEnvelopeDTO> {
    return { user: await this.users.ban(id, body, actor) };
  }

  @Post(":id/unban")
  @HttpCode(200)
  @RequireCapability("manageUsers")
  async unban(
    @CurrentUser() actor: AuthContext,
    @Param("id") id: string,
  ): Promise<AdminUserEnvelopeDTO> {
    return { user: await this.users.unban(id, actor) };
  }

  /** `manageRoles`, not `manageUsers` — this is the privilege-escalation surface. */
  @Patch(":id/role")
  @RequireCapability("manageRoles")
  async setRole(
    @CurrentUser() actor: AuthContext,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(setRoleSchema)) body: ContractOutput<typeof setRoleSchema>,
  ): Promise<AdminUserEnvelopeDTO> {
    return { user: await this.users.setRole(id, body.role, actor) };
  }

  @Post(":id/reset-password")
  @HttpCode(200)
  @RequireCapability("manageUsers")
  async resetPassword(
    @CurrentUser() actor: AuthContext,
    @Param("id") id: string,
  ): Promise<ResetPasswordDTO> {
    return await this.users.resetPassword(id, actor);
  }
}
