import {
  reportFiltersFromParams,
  type TimeAnalysisDTO,
} from "@destaworks/contracts/validation/reports";
import { requireCapability } from "@destaworks/auth/guards";
import { apiHandler, json } from "@destaworks/integrations/http/api-handler";
import { timeReportsService } from "@destaworks/application/reports/time-reports.service";

/** Response body of `GET /api/reports/time-analysis`. */
export type GetReportsTimeAnalysisResponse = TimeAnalysisDTO;

/** GET /api/reports/time-analysis (legacy `index.html:8611-8654`). */
export const GET = apiHandler(async (req: Request) => {
  const viewer = await requireCapability("viewReports");
  const filters = reportFiltersFromParams(new URL(req.url).searchParams);
  return json<GetReportsTimeAnalysisResponse>(
    await timeReportsService.timeAnalysis(viewer, filters),
  );
});
