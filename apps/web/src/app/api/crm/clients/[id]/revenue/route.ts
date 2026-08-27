import type { RevenueDTO } from "@destaworks/contracts/validation/crm-analytics";
import { requireCapability } from "@destaworks/auth/guards";
import { apiHandler, json } from "@destaworks/integrations/http/api-handler";
import { crmAnalyticsService } from "@destaworks/application/crm-analytics.service";

/** Wire shape of `GET /api/crm/clients/:id/revenue`. */
export type GetCrmClientRevenueResponse = RevenueDTO;

/** GET /api/crm/clients/:id/revenue — Revenue & Profitability (legacy `index.html:7176-7235`). */
export const GET = apiHandler<{ params: Promise<{ id: string }> }>(async (_req, ctx) => {
  await requireCapability("viewCrm");
  const { id } = await ctx.params;
  return json<GetCrmClientRevenueResponse>(await crmAnalyticsService.revenue(id));
});
