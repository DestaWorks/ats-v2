import { reportFiltersFromParams, type SourceRoiDTO } from "@/lib/validation/reports";
import { requireCapability } from "@/server/auth/guards";
import { apiHandler, json } from "@/server/http/api-handler";
import { teamReportsService } from "@/server/services/reports/team-reports.service";

/** Response body of `GET /api/reports/source-roi`. */
export type GetReportsSourceRoiResponse = SourceRoiDTO;

/** GET /api/reports/source-roi (legacy `index.html:8532-8571`). */
export const GET = apiHandler(async (req: Request) => {
  await requireCapability("viewReports");
  const filters = reportFiltersFromParams(new URL(req.url).searchParams);
  return json<GetReportsSourceRoiResponse>(await teamReportsService.sourceRoi(filters));
});
