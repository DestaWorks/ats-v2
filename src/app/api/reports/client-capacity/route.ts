import type { ClientCapacityDTO } from "@/lib/validation/reports";
import { requireCapability } from "@/server/auth/guards";
import { apiHandler, json } from "@/server/http/api-handler";
import { clientReportsService } from "@/server/services/reports/client-reports.service";

/** Response body of `GET /api/reports/client-capacity`. */
export type GetReportsClientCapacityResponse = ClientCapacityDTO;

/**
 * GET /api/reports/client-capacity — per-client capacity limits + "approaching capacity" alert
 * (legacy `vw="kpi"`, `index.html:2827-2916`; folded from the standalone `/analytics` page into
 * Reports 2026-08-03). Unfiltered/all-time, matching legacy's own scope for this widget.
 */
export const GET = apiHandler(async () => {
  await requireCapability("viewReports");
  return json<GetReportsClientCapacityResponse>(await clientReportsService.clientCapacity());
});
