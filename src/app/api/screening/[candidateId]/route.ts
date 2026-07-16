import { saveScreeningSchema } from "@/lib/validation/screening";
import { requireUser } from "@/server/auth/guards";
import { apiHandler, json } from "@/server/http/api-handler";
import { screeningService } from "@/server/services/screening.service";

/**
 * POST /api/screening/:candidateId — score a candidate and persist the scorecard; if `action` is
 * `advance`/`futurePipeline`, also attempt the matching stage move (Wave 3.3). The scorecard is
 * always persisted before a move is attempted — a `STAGE_BLOCKED` (422) never loses the
 * recruiter's scoring work. Open to any signed-in operator, matches `POST /api/candidates/:id/move`.
 */
export const POST = apiHandler<{ params: Promise<{ candidateId: string }> }>(async (req, ctx) => {
  const user = await requireUser();
  const { candidateId } = await ctx.params;
  const input = saveScreeningSchema.parse(await req.json());
  const scorecard = await screeningService.saveAndMaybeMove(candidateId, input, user);
  return json({ scorecard });
});
