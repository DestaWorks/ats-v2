import { reportFiltersFromParams, type ComplianceDTO } from "@/lib/validation/reports";
import { requireCapability } from "@/server/auth/guards";
import { apiHandler, json } from "@/server/http/api-handler";
import { timeReportsService } from "@/server/services/reports/time-reports.service";

/** Response body of `GET /api/reports/compliance`. */
export type GetReportsComplianceResponse = ComplianceDTO;

/** GET /api/reports/compliance (legacy `index.html:8656-8683`). */
export const GET = apiHandler(async (req: Request) => {
  await requireCapability("viewReports");
  const filters = reportFiltersFromParams(new URL(req.url).searchParams);
  return json<GetReportsComplianceResponse>(await timeReportsService.compliance(filters));
});
