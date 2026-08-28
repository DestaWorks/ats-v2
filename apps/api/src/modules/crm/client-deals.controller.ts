import { Body, Controller, Delete, Inject, Param, Patch, Post, UseGuards } from "@nestjs/common";
import {
  addBlockerSchema,
  createDealSchema,
  updateBlockerSchema,
  updateDealSchema,
} from "@destaworks/contracts/validation/client";
import type {
  DeleteCrmDealBlockerResponse,
  DeleteCrmDealResponse,
  PatchCrmDealBlockerResponse,
  PatchCrmDealResponse,
  PostCrmDealBlockerResponse,
  PostCrmDealResponse,
} from "@destaworks/contracts/http/crm";
import type { AuthUser } from "@destaworks/auth/guards";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { RequireCapability } from "../../common/decorators/require-capability.decorator";
import { CapabilityGuard } from "../../common/guards/capability.guard";
import { SessionAuthGuard } from "../../common/guards/session-auth.guard";
import { ZodValidationPipe, type ContractOutput } from "../../common/pipes/zod-validation.pipe";
import type { ServiceOf } from "../service-token";
import { CLIENT_SERVICE } from "./crm.tokens";

/**
 * Deals and the blockers hanging off them, together because a blocker has no life outside its
 * deal. Moving a deal's kanban stage and closing it are both the deal PATCH — one endpoint, so
 * `closedAt` is stamped by one code path and cannot be set by a client.
 */
@Controller("crm/clients/:id/deals")
@UseGuards(SessionAuthGuard, CapabilityGuard)
@RequireCapability("viewCrm")
export class CrmClientDealsController {
  constructor(
    @Inject(CLIENT_SERVICE)
    private readonly clients: ServiceOf<typeof CLIENT_SERVICE>,
  ) {}

  @Post()
  async add(
    @Param("id") clientId: string,
    @Body(new ZodValidationPipe(createDealSchema))
    body: ContractOutput<typeof createDealSchema>,
    @CurrentUser() user: AuthUser,
  ): Promise<PostCrmDealResponse> {
    return { deal: await this.clients.addDeal(clientId, body, user) };
  }

  @Patch(":dealId")
  async update(
    @Param("id") clientId: string,
    @Param("dealId") dealId: string,
    @Body(new ZodValidationPipe(updateDealSchema))
    body: ContractOutput<typeof updateDealSchema>,
    @CurrentUser() user: AuthUser,
  ): Promise<PatchCrmDealResponse> {
    return { deal: await this.clients.updateDeal(clientId, dealId, body, user) };
  }

  @Delete(":dealId")
  async remove(
    @Param("id") clientId: string,
    @Param("dealId") dealId: string,
    @CurrentUser() user: AuthUser,
  ): Promise<DeleteCrmDealResponse> {
    await this.clients.removeDeal(clientId, dealId, user);
    return { ok: true, id: dealId };
  }

  @Post(":dealId/blockers")
  async addBlocker(
    @Param("id") clientId: string,
    @Param("dealId") dealId: string,
    @Body(new ZodValidationPipe(addBlockerSchema))
    body: ContractOutput<typeof addBlockerSchema>,
    @CurrentUser() user: AuthUser,
  ): Promise<PostCrmDealBlockerResponse> {
    return { blocker: await this.clients.addBlocker(clientId, dealId, body, user) };
  }

  @Patch(":dealId/blockers/:blockerId")
  async updateBlocker(
    @Param("id") clientId: string,
    @Param("dealId") dealId: string,
    @Param("blockerId") blockerId: string,
    @Body(new ZodValidationPipe(updateBlockerSchema))
    body: ContractOutput<typeof updateBlockerSchema>,
    @CurrentUser() user: AuthUser,
  ): Promise<PatchCrmDealBlockerResponse> {
    return {
      blocker: await this.clients.updateBlocker(clientId, dealId, blockerId, body, user),
    };
  }

  @Delete(":dealId/blockers/:blockerId")
  async removeBlocker(
    @Param("id") clientId: string,
    @Param("dealId") dealId: string,
    @Param("blockerId") blockerId: string,
    @CurrentUser() user: AuthUser,
  ): Promise<DeleteCrmDealBlockerResponse> {
    await this.clients.removeBlocker(clientId, dealId, blockerId, user);
    return { ok: true, id: blockerId };
  }
}
