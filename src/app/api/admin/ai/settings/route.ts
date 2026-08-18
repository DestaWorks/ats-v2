import { setAiDisabledSchema } from "@/lib/validation/ai-ops";
import { requireCapability } from "@/server/auth/guards";
import { apiHandler, json } from "@/server/http/api-handler";
import { aiOpsService } from "@/server/services/ai-ops.service";

export const GET = apiHandler(async () => {
  await requireCapability("manageAiSettings");
  return json(await aiOpsService.getSettings());
});

export const PATCH = apiHandler(async (req: Request) => {
  const actor = await requireCapability("manageAiSettings");
  const input = setAiDisabledSchema.parse(await req.json());
  return json(await aiOpsService.setDisabled(input.disabled, actor, input.reason));
});
