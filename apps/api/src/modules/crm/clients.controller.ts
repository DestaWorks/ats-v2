import { Body, Controller, Get, Inject, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { createClientSchema, updateClientSchema } from "@destaworks/contracts/validation/client";
import type {
  GetCrmClientResponse,
  GetCrmClientsResponse,
  PatchCrmClientResponse,
  PostCrmClientResponse,
} from "@destaworks/contracts/http/crm";
import type { AuthContext } from "@destaworks/auth/guards";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { RequireCapability } from "../../common/decorators/require-capability.decorator";
import { CapabilityGuard } from "../../common/guards/capability.guard";
import { SessionAuthGuard } from "../../common/guards/session-auth.guard";
import { ZodValidationPipe, type ContractOutput } from "../../common/pipes/zod-validation.pipe";
import type { ServiceOf } from "../service-token";
import { CLIENT_SERVICE } from "./crm.tokens";

/**
 * The client record itself. `detail` is a COMPOSITE read — profile, contacts and pipeline snapshot
 * in one response — and stays one endpoint: splitting it would turn a single server render into
 * three round trips, which is exactly what SAAS-RESTRUCTURE-PLAN 4.0 forbids.
 *
 * The whole CRM is leadership-only, so the capability is declared once for the controller.
 */
@Controller("crm/clients")
@UseGuards(SessionAuthGuard, CapabilityGuard)
@RequireCapability("viewCrm")
export class CrmClientsController {
  constructor(
    @Inject(CLIENT_SERVICE)
    private readonly clients: ServiceOf<typeof CLIENT_SERVICE>,
  ) {}

  @Get()
  async list(@CurrentUser() user: AuthContext): Promise<GetCrmClientsResponse> {
    return this.clients.list(user);
  }

  @Post()
  async create(
    @Body(new ZodValidationPipe(createClientSchema))
    body: ContractOutput<typeof createClientSchema>,
    @CurrentUser() user: AuthContext,
  ): Promise<PostCrmClientResponse> {
    return { client: await this.clients.create(body, user) };
  }

  @Get(":id")
  async detail(
    @Param("id") id: string,
    @CurrentUser() user: AuthContext,
  ): Promise<GetCrmClientResponse> {
    return this.clients.detail(id, user);
  }

  @Patch(":id")
  async update(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateClientSchema))
    body: ContractOutput<typeof updateClientSchema>,
    @CurrentUser() user: AuthContext,
  ): Promise<PatchCrmClientResponse> {
    return { client: await this.clients.update(id, body, user) };
  }
}
