import { reportFiltersFromParams } from "@destaworks/contracts/validation/reports";
import { requireCapability } from "@destaworks/auth/guards";
import { apiHandler } from "@destaworks/integrations/http/api-handler";
import { exportService } from "@destaworks/application/reports/export.service";

/**
 * GET /api/reports/export — CSV download of the same filtered cohort every report derives from.
 * Legacy's export was 100% client-side (blob-URL trick, no backend route at all); this is the
 * first real CSV-export route in the app.
 */
export const GET = apiHandler(async (req: Request) => {
  await requireCapability("viewReports");
  const filters = reportFiltersFromParams(new URL(req.url).searchParams);
  const csv = await exportService.candidatesCsv(filters);
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="candidates-report.csv"',
    },
  });
});
