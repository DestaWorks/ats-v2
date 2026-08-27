import { reportFiltersFromParams, type TimeAnalysisDTO } from "@/lib/validation/reports";
import { requireCapability } from "@/server/auth/guards";
import { apiHandler, json } from "@/server/http/api-handler";
import { timeReportsService } from "@/server/services/reports/time-reports.service";

/** Response body of `GET /api/reports/time-analysis`. */
export type GetReportsTimeAnalysisResponse = TimeAnalysisDTO;

/** GET /api/reports/time-analysis (legacy `index.html:8611-8654`). */
export const GET = apiHandler(async (req: Request) => {
  await requireCapability("viewReports");
  const filters = reportFiltersFromParams(new URL(req.url).searchParams);
  return json<GetReportsTimeAnalysisResponse>(await timeReportsService.timeAnalysis(filters));
});
