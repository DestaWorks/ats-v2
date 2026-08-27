import type { RevenueDTO } from "@/lib/validation/crm-analytics";
import { requireCapability } from "@/server/auth/guards";
import { apiHandler, json } from "@/server/http/api-handler";
import { crmAnalyticsService } from "@/server/services/crm-analytics.service";

/** Wire shape of `GET /api/crm/clients/:id/revenue`. */
export type GetCrmClientRevenueResponse = RevenueDTO;

/** GET /api/crm/clients/:id/revenue — Revenue & Profitability (legacy `index.html:7176-7235`). */
export const GET = apiHandler<{ params: Promise<{ id: string }> }>(async (_req, ctx) => {
  await requireCapability("viewCrm");
  const { id } = await ctx.params;
  return json<GetCrmClientRevenueResponse>(await crmAnalyticsService.revenue(id));
});
