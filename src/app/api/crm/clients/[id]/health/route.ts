import { requireCapability } from "@/server/auth/guards";
import { apiHandler, json } from "@/server/http/api-handler";
import { crmAnalyticsService } from "@/server/services/crm-analytics.service";

/** GET /api/crm/clients/:id/health — Client Health Score (legacy `index.html:7014-7025`). */
export const GET = apiHandler<{ params: Promise<{ id: string }> }>(async (_req, ctx) => {
  await requireCapability("viewCrm");
  const { id } = await ctx.params;
  return json(await crmAnalyticsService.healthScore(id));
});
