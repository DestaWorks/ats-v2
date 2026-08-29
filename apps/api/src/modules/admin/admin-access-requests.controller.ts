import { Body, Controller, Get, HttpCode, Inject, Param, Post, UseGuards } from "@nestjs/common";
import {
  approveRequestSchema,
  type AccessRequestListDTO,
  type GeneratedPasswordDTO,
} from "@destaworks/contracts/validation/admin";
import type { AcknowledgedIdDTO } from "@destaworks/contracts/api";
import type { AuthContext } from "@destaworks/auth/guards";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { RequireCapability } from "../../common/decorators/require-capability.decorator";
import { CapabilityGuard } from "../../common/guards/capability.guard";
import { SessionAuthGuard } from "../../common/guards/session-auth.guard";
import { ZodValidationPipe, type ContractOutput } from "../../common/pipes/zod-validation.pipe";
import type { ServiceOf } from "../service-token";
import { ACCESS_REQUEST_SERVICE } from "./admin.tokens";

/**
 * Requests for access to the OPERATOR app — the queue an admin works through. Requests for access
 * to the client portal are a different audience and a different capability; they live in
 * `AdminPortalRequestsController`.
 *
 * All three routes are `manageAccessRequests`. Approving picks a role and creates the account, so
 * it is the same privilege surface as the queue itself and is not widened by being a POST.
 */
@Controller("admin/access-requests")
@UseGuards(SessionAuthGuard, CapabilityGuard)
export class AdminAccessRequestsController {
  constructor(
    @Inject(ACCESS_REQUEST_SERVICE)
    private readonly requests: ServiceOf<typeof ACCESS_REQUEST_SERVICE>,
  ) {}

  @Get()
  @RequireCapability("manageAccessRequests")
  async list(): Promise<AccessRequestListDTO> {
    return { requests: await this.requests.list() };
  }

  /** 200: the request already existed — approving transitions it and creates the account. */
  @Post(":id/approve")
  @HttpCode(200)
  @RequireCapability("manageAccessRequests")
  async approve(
    @CurrentUser() actor: AuthContext,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(approveRequestSchema))
    body: ContractOutput<typeof approveRequestSchema>,
  ): Promise<GeneratedPasswordDTO> {
    return await this.requests.approve(id, body.role, actor);
  }

  @Post(":id/decline")
  @HttpCode(200)
  @RequireCapability("manageAccessRequests")
  async decline(@Param("id") id: string): Promise<AcknowledgedIdDTO> {
    await this.requests.decline(id);
    return { ok: true, id };
  }
}
