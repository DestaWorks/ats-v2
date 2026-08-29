import {
  reportFiltersFromParams,
  type ClientFunnelDTO,
} from "@destaworks/contracts/validation/reports";
import { requireCapability } from "@destaworks/auth/guards";
import { apiHandler, json } from "@destaworks/integrations/http/api-handler";
import { clientReportsService } from "@destaworks/application/reports/client-reports.service";

/** Response body of `GET /api/reports/client-funnel`. */
export type GetReportsClientFunnelResponse = ClientFunnelDTO;

/** GET /api/reports/client-funnel — Per-Client Funnel + WoW (legacy `index.html:8374-8425`). */
export const GET = apiHandler(async (req: Request) => {
  const viewer = await requireCapability("viewReports");
  const filters = reportFiltersFromParams(new URL(req.url).searchParams);
  return json<GetReportsClientFunnelResponse>(
    await clientReportsService.perClientFunnel(viewer, filters),
  );
});
