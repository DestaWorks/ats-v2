import { requireCapability } from "@/server/auth/guards";
import { apiHandler, json } from "@/server/http/api-handler";
import { crmAnalyticsService } from "@/server/services/crm-analytics.service";

/** GET /api/crm/compare — cross-client Compare dashboard (legacy `index.html:7330-7354`). */
export const GET = apiHandler(async () => {
  await requireCapability("viewCrm");
  return json({ clients: await crmAnalyticsService.compare() });
});
