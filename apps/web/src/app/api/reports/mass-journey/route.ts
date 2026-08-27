import {
  reportFiltersFromParams,
  type MassJourneyDTO,
} from "@destaworks/contracts/validation/reports";
import { requireCapability } from "@destaworks/auth/guards";
import { apiHandler, json } from "@destaworks/integrations/http/api-handler";
import { massJourneyReport } from "@destaworks/application/reports/mass-journey.report";

/** Response body of `GET /api/reports/mass-journey`. */
export type GetReportsMassJourneyResponse = MassJourneyDTO;

/** GET /api/reports/mass-journey — the Gantt view (legacy `index.html:8267-8372`). */
export const GET = apiHandler(async (req: Request) => {
  await requireCapability("viewReports");
  const filters = reportFiltersFromParams(new URL(req.url).searchParams);
  return json<GetReportsMassJourneyResponse>(await massJourneyReport.massJourney(filters));
});
