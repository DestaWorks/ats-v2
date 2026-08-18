import { requireCapability } from "@/server/auth/guards";
import { apiHandler, json } from "@/server/http/api-handler";
import { aiOpsService } from "@/server/services/ai-ops.service";

export const GET = apiHandler(async () => {
  await requireCapability("manageAiSettings");
  return json(await aiOpsService.getUsageOverview());
});
