import {
  reportFiltersFromParams,
  type TeamPerformanceDTO,
} from "@destaworks/contracts/validation/reports";
import { requireCapability } from "@destaworks/auth/guards";
import { apiHandler, json } from "@destaworks/integrations/http/api-handler";
import { teamReportsService } from "@destaworks/application/reports/team-reports.service";

/** Response body of `GET /api/reports/team-performance`. */
export type GetReportsTeamPerformanceResponse = TeamPerformanceDTO;

/** GET /api/reports/team-performance (legacy `index.html:8452-8530`). */
export const GET = apiHandler(async (req: Request) => {
  await requireCapability("viewReports");
  const filters = reportFiltersFromParams(new URL(req.url).searchParams);
  return json<GetReportsTeamPerformanceResponse>(await teamReportsService.teamPerformance(filters));
});
