import { requireCapability } from "@/server/auth/guards";
import { apiHandler, json } from "@/server/http/api-handler";
import { trendsReport } from "@/server/services/reports/trends.report";

/**
 * GET /api/reports/trends — rolling W/M/Q Anomalies + Funnel + Trends (legacy `index.html:6379-
 * 6557`, the Weekly Brief's "DROP 50" block). Unfiltered/team-wide, matching legacy's scope.
 */
export const GET = apiHandler(async () => {
  await requireCapability("viewReports");
  return json(await trendsReport.trends());
});
