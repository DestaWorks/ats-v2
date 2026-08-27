import { reportFiltersFromParams, type MassJourneyDTO } from "@/lib/validation/reports";
import { requireCapability } from "@/server/auth/guards";
import { apiHandler, json } from "@/server/http/api-handler";
import { massJourneyReport } from "@/server/services/reports/mass-journey.report";

/** Response body of `GET /api/reports/mass-journey`. */
export type GetReportsMassJourneyResponse = MassJourneyDTO;

/** GET /api/reports/mass-journey — the Gantt view (legacy `index.html:8267-8372`). */
export const GET = apiHandler(async (req: Request) => {
  await requireCapability("viewReports");
  const filters = reportFiltersFromParams(new URL(req.url).searchParams);
  return json<GetReportsMassJourneyResponse>(await massJourneyReport.massJourney(filters));
});
