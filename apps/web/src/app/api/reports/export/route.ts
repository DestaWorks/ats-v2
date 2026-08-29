import { reportFiltersFromParams } from "@destaworks/contracts/validation/reports";
import { requireCapability } from "@destaworks/auth/guards";
import { apiHandler } from "@destaworks/integrations/http/api-handler";
import { exportService } from "@destaworks/application/reports/export.service";

/**
 * GET /api/reports/export — CSV download of the same filtered cohort every report derives from.
 * Legacy's export was 100% client-side (blob-URL trick, no backend route at all); this is the
 * first real CSV-export route in the app.
 *
 * Phase 5 moved this work to a job (`reports.export.candidates`), and the asynchronous flow —
 * `POST /reports/export/jobs` then `GET /reports/export/jobs/:id` for a short-lived signed
 * download — lives on the NestJS API, because only `@destaworks/jobs` may enqueue and
 * `apps/web` may not import it (the dependency law draws web → api over HTTP, not web → jobs).
 *
 * This route therefore stays exactly as it was, and the `<a href>` on `/reports` keeps pointing
 * at it: it is the synchronous path, unbounded for a very large cohort, and it is what the
 * Phase 4.3 traffic switch retires when the browser starts talking to the API. Deleting it now
 * would break the only download the UI has; changing its shape would break the link for no gain.
 */
export const GET = apiHandler(async (req: Request) => {
  const viewer = await requireCapability("viewReports");
  const filters = reportFiltersFromParams(new URL(req.url).searchParams);
  const csv = await exportService.candidatesCsv(viewer, filters);
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="candidates-report.csv"',
    },
  });
});
