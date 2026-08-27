import {
  generateWorkspaceSchema,
  type WorkspaceResultDTO,
} from "@destaworks/contracts/validation/crm-ai-workspace";
import { requireCapability } from "@destaworks/auth/guards";
import { apiHandler, json } from "@destaworks/integrations/http/api-handler";
import { checkRateLimit } from "@destaworks/integrations/http/rate-limit";
import { crmAiWorkspaceService } from "@destaworks/application/crm-ai-workspace.service";

/** Wire shape of `POST /api/crm/clients/:id/ai-workspace`. */
export type PostCrmAiWorkspaceResponse = WorkspaceResultDTO;

/**
 * POST /api/crm/clients/:id/ai-workspace — AI Client Workspace (legacy `crm_ai_workspace`).
 * Rate-limited (paid LLM call, mirrors `inbound/triage`'s 20/min).
 */
export const POST = apiHandler<{ params: Promise<{ id: string }> }>(async (req, ctx) => {
  const user = await requireCapability("viewCrm");
  await checkRateLimit(`crm-ai-workspace:${user.id}`, { limit: 20, windowMs: 60_000 });
  const { id } = await ctx.params;
  const input = generateWorkspaceSchema.parse(await req.json());
  const result = await crmAiWorkspaceService.generate(id, input);
  return json<PostCrmAiWorkspaceResponse>(result);
});
