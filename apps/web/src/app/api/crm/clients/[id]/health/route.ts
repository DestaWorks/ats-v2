import type * as Contract from "@destaworks/contracts/http/crm";
import { requireCapability } from "@destaworks/auth/guards";
import { apiHandler, json } from "@destaworks/integrations/http/api-handler";
import { crmAnalyticsService } from "@destaworks/application/crm-analytics.service";

/** Wire shape of `GET /api/crm/clients/:id/health`. */
export type GetCrmClientHealthResponse = Contract.GetCrmClientHealthResponse;

/** GET /api/crm/clients/:id/health — Client Health Score (legacy `index.html:7014-7025`). */
export const GET = apiHandler<{ params: Promise<{ id: string }> }>(async (_req, ctx) => {
  await requireCapability("viewCrm");
  const { id } = await ctx.params;
  return json<GetCrmClientHealthResponse>(await crmAnalyticsService.healthScore(id));
});
