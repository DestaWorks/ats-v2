import { requireCapability } from "@destaworks/auth/guards";
import { apiHandler, json } from "@destaworks/integrations/http/api-handler";
import { aiOpsService } from "@destaworks/application/ai-ops.service";
import type { AiUsageOverviewDTO } from "@destaworks/contracts/validation/ai-ops";

/** Response body of `GET /api/admin/ai/usage`. */
export type GetAdminAiUsageResponse = AiUsageOverviewDTO;

export const GET = apiHandler(async () => {
  await requireCapability("manageAiSettings");
  return json<GetAdminAiUsageResponse>(await aiOpsService.getUsageOverview());
});
