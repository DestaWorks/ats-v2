import { Body, Controller, HttpCode, Inject, Param, Post, UseGuards } from "@nestjs/common";
import { generateWorkspaceSchema } from "@destaworks/contracts/validation/crm-ai-workspace";
import type { PostCrmAiWorkspaceResponse } from "@destaworks/contracts/http/crm";
import { RateLimit } from "../../common/decorators/rate-limit.decorator";
import { RequireCapability } from "../../common/decorators/require-capability.decorator";
import { CapabilityGuard } from "../../common/guards/capability.guard";
import { RateLimitGuard } from "../../common/guards/rate-limit.guard";
import { SessionAuthGuard } from "../../common/guards/session-auth.guard";
import { ZodValidationPipe, type ContractOutput } from "../../common/pipes/zod-validation.pipe";
import type { ServiceOf } from "../service-token";
import { CRM_AI_WORKSPACE_SERVICE } from "./crm.tokens";

/**
 * The AI Client Workspace (legacy `crm_ai_workspace`). A POST because it generates, not because it
 * creates — hence the explicit 200; there is no resource at a new URL.
 *
 * Rate limited per caller because every request is a paid LLM call. The guard is ordered after the
 * auth guards so the bucket is keyed on the user, not shared across everyone.
 */
@Controller("crm/clients/:id/ai-workspace")
@UseGuards(SessionAuthGuard, CapabilityGuard, RateLimitGuard)
@RequireCapability("viewCrm")
export class CrmAiWorkspaceController {
  constructor(
    @Inject(CRM_AI_WORKSPACE_SERVICE)
    private readonly workspace: ServiceOf<typeof CRM_AI_WORKSPACE_SERVICE>,
  ) {}

  @Post()
  @HttpCode(200)
  @RateLimit({ name: "crm-ai-workspace", limit: 20, windowMs: 60_000 })
  async generate(
    @Param("id") clientId: string,
    @Body(new ZodValidationPipe(generateWorkspaceSchema))
    body: ContractOutput<typeof generateWorkspaceSchema>,
  ): Promise<PostCrmAiWorkspaceResponse> {
    return this.workspace.generate(clientId, body);
  }
}
