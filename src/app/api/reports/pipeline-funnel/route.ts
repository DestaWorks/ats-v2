import { reportFiltersFromParams, type PipelineFunnelDTO } from "@/lib/validation/reports";
import { requireCapability } from "@/server/auth/guards";
import { apiHandler, json } from "@/server/http/api-handler";
import { pipelineReportsService } from "@/server/services/reports/pipeline-reports.service";

/** Response body of `GET /api/reports/pipeline-funnel`. */
export type GetReportsPipelineFunnelResponse = PipelineFunnelDTO;

/** GET /api/reports/pipeline-funnel (legacy `index.html:8427-8450`). */
export const GET = apiHandler(async (req: Request) => {
  await requireCapability("viewReports");
  const filters = reportFiltersFromParams(new URL(req.url).searchParams);
  return json<GetReportsPipelineFunnelResponse>(
    await pipelineReportsService.pipelineFunnel(filters),
  );
});
