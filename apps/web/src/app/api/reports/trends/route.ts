import type { TrendsDTO } from "@destaworks/contracts/validation/reports";
import { requireCapability } from "@destaworks/auth/guards";
import { apiHandler, json } from "@destaworks/integrations/http/api-handler";
import { trendsReport } from "@destaworks/application/reports/trends.report";

/** Response body of `GET /api/reports/trends`. */
export type GetReportsTrendsResponse = TrendsDTO;

/**
 * GET /api/reports/trends — rolling W/M/Q Anomalies + Funnel + Trends (legacy `index.html:6379-
 * 6557`, the Weekly Brief's "DROP 50" block). Unfiltered/team-wide, matching legacy's scope.
 */
export const GET = apiHandler(async () => {
  const user = await requireCapability("viewReports");
  return json<GetReportsTrendsResponse>(await trendsReport.trends(user));
});
