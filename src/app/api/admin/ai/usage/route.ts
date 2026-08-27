import { requireCapability } from "@/server/auth/guards";
import { apiHandler, json } from "@/server/http/api-handler";
import { aiOpsService } from "@/server/services/ai-ops.service";
import type { AiUsageOverviewDTO } from "@/lib/validation/ai-ops";

/** Response body of `GET /api/admin/ai/usage`. */
export type GetAdminAiUsageResponse = AiUsageOverviewDTO;

export const GET = apiHandler(async () => {
  await requireCapability("manageAiSettings");
  return json<GetAdminAiUsageResponse>(await aiOpsService.getUsageOverview());
});
