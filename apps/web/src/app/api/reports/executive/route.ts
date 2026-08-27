import {
  reportFiltersFromParams,
  type ExecutiveSummaryDTO,
} from "@destaworks/contracts/validation/reports";
import { requireCapability } from "@destaworks/auth/guards";
import { apiHandler, json } from "@destaworks/integrations/http/api-handler";
import { pipelineReportsService } from "@destaworks/application/reports/pipeline-reports.service";

/** Response body of `GET /api/reports/executive`. */
export type GetReportsExecutiveResponse = ExecutiveSummaryDTO;

/** GET /api/reports/executive — Executive Summary (legacy `index.html:8228-8265`). */
export const GET = apiHandler(async (req: Request) => {
  await requireCapability("viewReports");
  const filters = reportFiltersFromParams(new URL(req.url).searchParams);
  return json<GetReportsExecutiveResponse>(await pipelineReportsService.executiveSummary(filters));
});
