import {
  generateWorkspaceSchema,
  type WorkspaceResultDTO,
} from "@/lib/validation/crm-ai-workspace";
import { requireCapability } from "@/server/auth/guards";
import { apiHandler, json } from "@/server/http/api-handler";
import { checkRateLimit } from "@/server/http/rate-limit";
import { crmAiWorkspaceService } from "@/server/services/crm-ai-workspace.service";

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
