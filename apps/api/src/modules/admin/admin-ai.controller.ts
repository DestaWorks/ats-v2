import { Body, Controller, Get, Inject, Patch, UseGuards } from "@nestjs/common";
import {
  setAiDisabledSchema,
  type AiSettingsDTO,
  type AiUsageOverviewDTO,
} from "@destaworks/contracts/validation/ai-ops";
import type { AuthContext } from "@destaworks/auth/guards";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { RequireCapability } from "../../common/decorators/require-capability.decorator";
import { CapabilityGuard } from "../../common/guards/capability.guard";
import { SessionAuthGuard } from "../../common/guards/session-auth.guard";
import { ZodValidationPipe, type ContractOutput } from "../../common/pipes/zod-validation.pipe";
import type { ServiceOf } from "../service-token";
import { AI_OPS_SERVICE } from "./admin.tokens";

/**
 * The AI kill switch and the spend it exists to control, both gated `manageAiSettings`.
 *
 * Usage is on the same capability as the switch on purpose: the numbers are what justifies
 * flipping it, so anyone who can disable AI can see why they would.
 */
@Controller("admin/ai")
@UseGuards(SessionAuthGuard, CapabilityGuard)
export class AdminAiController {
  constructor(@Inject(AI_OPS_SERVICE) private readonly aiOps: ServiceOf<typeof AI_OPS_SERVICE>) {}

  @Get("settings")
  @RequireCapability("manageAiSettings")
  async getSettings(): Promise<AiSettingsDTO> {
    return await this.aiOps.getSettings();
  }

  @Patch("settings")
  @RequireCapability("manageAiSettings")
  async setSettings(
    @CurrentUser() actor: AuthContext,
    @Body(new ZodValidationPipe(setAiDisabledSchema))
    body: ContractOutput<typeof setAiDisabledSchema>,
  ): Promise<AiSettingsDTO> {
    return await this.aiOps.setDisabled(body.disabled, actor, body.reason);
  }

  @Get("usage")
  @RequireCapability("manageAiSettings")
  async getUsage(): Promise<AiUsageOverviewDTO> {
    return await this.aiOps.getUsageOverview();
  }
}
