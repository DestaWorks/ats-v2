import { reportFiltersFromParams } from "@/lib/validation/reports";
import { requireCapability } from "@/server/auth/guards";
import { apiHandler, json } from "@/server/http/api-handler";
import { clientReportsService } from "@/server/services/reports/client-reports.service";

/** GET /api/reports/client-portfolio (legacy `index.html:8573-8609`). */
export const GET = apiHandler(async (req: Request) => {
  await requireCapability("viewReports");
  const filters = reportFiltersFromParams(new URL(req.url).searchParams);
  return json(await clientReportsService.clientPortfolio(filters));
});
