import { requireCapability } from "@/server/auth/guards";
import { apiHandler, json } from "@/server/http/api-handler";
import { clientReportsService } from "@/server/services/reports/client-reports.service";

/**
 * GET /api/reports/client-capacity — per-client capacity limits + "approaching capacity" alert
 * (legacy `vw="kpi"`, `index.html:2827-2916`; folded from the standalone `/analytics` page into
 * Reports 2026-08-03). Unfiltered/all-time, matching legacy's own scope for this widget.
 */
export const GET = apiHandler(async () => {
  await requireCapability("viewReports");
  return json(await clientReportsService.clientCapacity());
});
