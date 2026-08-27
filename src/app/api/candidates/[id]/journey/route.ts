import { requireUser } from "@/server/auth/guards";
import { apiHandler, json } from "@/server/http/api-handler";
import { candidateService } from "@/server/services/candidate.service";
import type { JourneyDTO } from "@/lib/validation/journey";

/** Wire shape of `GET /api/candidates/:id/journey` — the full oldest-first timeline. */
export type GetCandidateJourneyResponse = JourneyDTO;

/**
 * GET /api/candidates/:id/journey — the full timeline (sourcing origin → promote → stage moves →
 * viewer-VISIBLE notes → outreach), oldest first. Note visibility is the same server-side
 * `visibleNotes` scope as the detail tabs. 404 missing/soft-deleted; 401 unauth.
 */
export const GET = apiHandler<{ params: Promise<{ id: string }> }>(async (_req, ctx) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  return json<GetCandidateJourneyResponse>(await candidateService.getJourney(id, user));
});
