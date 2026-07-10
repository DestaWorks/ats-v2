import { requireUser } from "@/server/auth/guards";
import { apiHandler, json } from "@/server/http/api-handler";
import { candidateService } from "@/server/services/candidate.service";

/**
 * GET /api/candidates/:id/journey — the full timeline (sourcing origin → promote → stage moves →
 * viewer-VISIBLE notes → outreach), oldest first. Note visibility is the same server-side
 * `visibleNotes` scope as the detail tabs. 404 missing/soft-deleted; 401 unauth.
 */
export const GET = apiHandler<{ params: Promise<{ id: string }> }>(async (_req, ctx) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  return json(await candidateService.getJourney(id, user));
});
