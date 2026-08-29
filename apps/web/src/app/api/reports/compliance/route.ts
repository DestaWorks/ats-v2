import {
  reportFiltersFromParams,
  type ComplianceDTO,
} from "@destaworks/contracts/validation/reports";
import { requireCapability } from "@destaworks/auth/guards";
import { apiHandler, json } from "@destaworks/integrations/http/api-handler";
import { timeReportsService } from "@destaworks/application/reports/time-reports.service";

/** Response body of `GET /api/reports/compliance`. */
export type GetReportsComplianceResponse = ComplianceDTO;

/** GET /api/reports/compliance (legacy `index.html:8656-8683`). */
export const GET = apiHandler(async (req: Request) => {
  const viewer = await requireCapability("viewReports");
  const filters = reportFiltersFromParams(new URL(req.url).searchParams);
  return json<GetReportsComplianceResponse>(await timeReportsService.compliance(viewer, filters));
});
