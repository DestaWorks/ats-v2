import {
  reportFiltersFromParams,
  type ClientPortfolioDTO,
} from "@destaworks/contracts/validation/reports";
import { requireCapability } from "@destaworks/auth/guards";
import { apiHandler, json } from "@destaworks/integrations/http/api-handler";
import { clientReportsService } from "@destaworks/application/reports/client-reports.service";

/** Response body of `GET /api/reports/client-portfolio`. */
export type GetReportsClientPortfolioResponse = ClientPortfolioDTO;

/** GET /api/reports/client-portfolio (legacy `index.html:8573-8609`). */
export const GET = apiHandler(async (req: Request) => {
  const viewer = await requireCapability("viewReports");
  const filters = reportFiltersFromParams(new URL(req.url).searchParams);
  return json<GetReportsClientPortfolioResponse>(
    await clientReportsService.clientPortfolio(viewer, filters),
  );
});
