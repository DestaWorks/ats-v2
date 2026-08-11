import { uploadCandidateResumeSchema } from "@/lib/validation/candidate";
import { requireUser } from "@/server/auth/guards";
import { apiHandler, json } from "@/server/http/api-handler";
import { checkRateLimit } from "@/server/http/rate-limit";
import { resumeService } from "@/server/services/resume.service";
import { toDocumentSummaryDTO } from "@/server/services/candidate.dto";

/**
 * POST /api/candidates/:id/resume — attach a résumé directly to this ALREADY-KNOWN candidate (the
 * detail page's own Resume tab), no AI extraction/matching involved (that's the separate Parse
 * Resume flow, `/api/resume/*`). Guarded by `requireUser()`, same posture as every other candidate
 * mutation route. Rate-limited since a real Storage call may have already backed the upload.
 * 201 on attach, 401 unauth, 404 if the candidate is missing/soft-deleted, 422 on a bad body.
 */
export const POST = apiHandler<{ params: Promise<{ id: string }> }>(async (req, ctx) => {
  const user = await requireUser();
  checkRateLimit(`candidate-resume-upload:${user.id}`, { limit: 20, windowMs: 60_000 });
  const { id } = await ctx.params;
  const input = uploadCandidateResumeSchema.parse(await req.json());
  const document = await resumeService.attachToCandidate(id, input, user);
  return json({ document: toDocumentSummaryDTO(document) }, 201);
});
