import { reportFiltersFromParams } from "@/lib/validation/reports";
import { requireCapability } from "@/server/auth/guards";
import { apiHandler, json } from "@/server/http/api-handler";
import { pipelineReportsService } from "@/server/services/reports/pipeline-reports.service";

/** GET /api/reports/executive — Executive Summary (legacy `index.html:8228-8265`). */
export const GET = apiHandler(async (req: Request) => {
  await requireCapability("viewReports");
  const filters = reportFiltersFromParams(new URL(req.url).searchParams);
  return json(await pipelineReportsService.executiveSummary(filters));
});
