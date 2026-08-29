import type * as Contract from "@destaworks/contracts/http/crm";
import { requireCapability } from "@destaworks/auth/guards";
import { apiHandler, json } from "@destaworks/integrations/http/api-handler";
import { crmAnalyticsService } from "@destaworks/application/crm-analytics.service";

/** Wire shape of `GET /api/crm/compare`. */
export type GetCrmCompareResponse = Contract.GetCrmCompareResponse;

/** GET /api/crm/compare — cross-client Compare dashboard (legacy `index.html:7330-7354`). */
export const GET = apiHandler(async () => {
  const user = await requireCapability("viewCrm");
  return json<GetCrmCompareResponse>({ clients: await crmAnalyticsService.compare(user) });
});
