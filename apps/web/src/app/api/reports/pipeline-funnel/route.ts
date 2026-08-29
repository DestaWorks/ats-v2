import {
  reportFiltersFromParams,
  type PipelineFunnelDTO,
} from "@destaworks/contracts/validation/reports";
import { requireCapability } from "@destaworks/auth/guards";
import { apiHandler, json } from "@destaworks/integrations/http/api-handler";
import { pipelineReportsService } from "@destaworks/application/reports/pipeline-reports.service";

/** Response body of `GET /api/reports/pipeline-funnel`. */
export type GetReportsPipelineFunnelResponse = PipelineFunnelDTO;

/** GET /api/reports/pipeline-funnel (legacy `index.html:8427-8450`). */
export const GET = apiHandler(async (req: Request) => {
  const viewer = await requireCapability("viewReports");
  const filters = reportFiltersFromParams(new URL(req.url).searchParams);
  return json<GetReportsPipelineFunnelResponse>(
    await pipelineReportsService.pipelineFunnel(viewer, filters),
  );
});
