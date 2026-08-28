import { Body, Controller, Delete, Get, Inject, Param, Post, UseGuards } from "@nestjs/common";
import { createSavedIcpSchema } from "@destaworks/contracts/validation/saved-icp";
import type {
  DeleteSavedIcpResponse,
  GetSavedIcpsResponse,
  PostSavedIcpResponse,
} from "@destaworks/contracts/http/saved-icp";
import type { AuthUser } from "@destaworks/auth/guards";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { RequireCapability } from "../../common/decorators/require-capability.decorator";
import { CapabilityGuard } from "../../common/guards/capability.guard";
import { SessionAuthGuard } from "../../common/guards/session-auth.guard";
import { ZodValidationPipe, type ContractOutput } from "../../common/pipes/zod-validation.pipe";
import type { ServiceOf } from "../service-token";
import { SAVED_ICP_SERVICE } from "./discover.tokens";

/**
 * Saved ICPs — the named NPPES searches Client Discovery runs from. Gated as a whole rather than
 * per handler: an ICP is only meaningful to someone who can open Discovery, so the capability is
 * the same for reading one, saving one and deleting one. Ownership within that group is the
 * service's `user` argument, not a second gate here.
 */
@Controller("saved-icps")
@UseGuards(SessionAuthGuard, CapabilityGuard)
@RequireCapability("viewClientDiscovery")
export class SavedIcpsController {
  constructor(
    @Inject(SAVED_ICP_SERVICE)
    private readonly savedIcps: ServiceOf<typeof SAVED_ICP_SERVICE>,
  ) {}

  @Get()
  async list(@CurrentUser() user: AuthUser): Promise<GetSavedIcpsResponse> {
    return { savedIcps: await this.savedIcps.list(user) };
  }

  @Post()
  async create(
    @Body(new ZodValidationPipe(createSavedIcpSchema))
    body: ContractOutput<typeof createSavedIcpSchema>,
    @CurrentUser() user: AuthUser,
  ): Promise<PostSavedIcpResponse> {
    return { savedIcp: await this.savedIcps.create(body, user) };
  }

  @Delete(":id")
  async remove(
    @Param("id") id: string,
    @CurrentUser() user: AuthUser,
  ): Promise<DeleteSavedIcpResponse> {
    return this.savedIcps.remove(id, user);
  }
}
