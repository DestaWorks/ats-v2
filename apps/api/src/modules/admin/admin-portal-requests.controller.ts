import { Body, Controller, Get, HttpCode, Inject, Param, Post, UseGuards } from "@nestjs/common";
import {
  approvePortalRequestSchema,
  type GeneratedPortalLinkDTO,
  type PortalAccessRequestListDTO,
} from "@destaworks/contracts/validation/portal";
import type { AcknowledgedIdDTO } from "@destaworks/contracts/api";
import type { AuthContext } from "@destaworks/auth/guards";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { RequireCapability } from "../../common/decorators/require-capability.decorator";
import { CapabilityGuard } from "../../common/guards/capability.guard";
import { SessionAuthGuard } from "../../common/guards/session-auth.guard";
import { ZodValidationPipe, type ContractOutput } from "../../common/pipes/zod-validation.pipe";
import type { ServiceOf } from "../service-token";
import { PORTAL_ACCESS_REQUEST_SERVICE } from "../portal/portal.module";

/**
 * The OPERATOR side of client-portal access: the queue of contacts asking to be let in, and the
 * approve/decline that grants or refuses a portal link.
 *
 * It lives under `AdminModule` because its callers are operators on the admin surface, while the
 * service it drives belongs to `PortalModule`, which owns that audience — the module is imported
 * for the token rather than the service being duplicated here.
 *
 * `configureClientPortal`, NOT `manageUsers`: approving here mints a portal link for an external
 * client contact, which is a different grant from creating an operator account, and the two are
 * held by different people.
 */
@Controller("admin/portal/requests")
@UseGuards(SessionAuthGuard, CapabilityGuard)
export class AdminPortalRequestsController {
  constructor(
    @Inject(PORTAL_ACCESS_REQUEST_SERVICE)
    private readonly requests: ServiceOf<typeof PORTAL_ACCESS_REQUEST_SERVICE>,
  ) {}

  @Get()
  @RequireCapability("configureClientPortal")
  async list(): Promise<PortalAccessRequestListDTO> {
    return { requests: await this.requests.list() };
  }

  /** 200: the request already existed — approving transitions it and mints the link. */
  @Post(":id/approve")
  @HttpCode(200)
  @RequireCapability("configureClientPortal")
  async approve(
    @CurrentUser() actor: AuthContext,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(approvePortalRequestSchema))
    body: ContractOutput<typeof approvePortalRequestSchema>,
  ): Promise<GeneratedPortalLinkDTO> {
    return await this.requests.approve(id, body, actor);
  }

  @Post(":id/decline")
  @HttpCode(200)
  @RequireCapability("configureClientPortal")
  async decline(@Param("id") id: string): Promise<AcknowledgedIdDTO> {
    await this.requests.decline(id);
    return { ok: true, id };
  }
}
