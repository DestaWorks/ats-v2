import { analyticsFiltersFromParams } from "@/lib/validation/reports";
import { requireCapability } from "@/server/auth/guards";
import { apiHandler, json } from "@/server/http/api-handler";
import { analyticsService } from "@/server/services/analytics.service";

/** GET /api/analytics — the KPI view (legacy `vw="kpi"`, `index.html:2827-2916`). */
export const GET = apiHandler(async (req: Request) => {
  await requireCapability("viewAnalytics");
  const filters = analyticsFiltersFromParams(new URL(req.url).searchParams);
  return json(await analyticsService.overview(filters));
});
