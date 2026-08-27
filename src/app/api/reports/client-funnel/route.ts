import { reportFiltersFromParams, type ClientFunnelDTO } from "@/lib/validation/reports";
import { requireCapability } from "@/server/auth/guards";
import { apiHandler, json } from "@/server/http/api-handler";
import { clientReportsService } from "@/server/services/reports/client-reports.service";

/** Response body of `GET /api/reports/client-funnel`. */
export type GetReportsClientFunnelResponse = ClientFunnelDTO;

/** GET /api/reports/client-funnel — Per-Client Funnel + WoW (legacy `index.html:8374-8425`). */
export const GET = apiHandler(async (req: Request) => {
  await requireCapability("viewReports");
  const filters = reportFiltersFromParams(new URL(req.url).searchParams);
  return json<GetReportsClientFunnelResponse>(await clientReportsService.perClientFunnel(filters));
});
