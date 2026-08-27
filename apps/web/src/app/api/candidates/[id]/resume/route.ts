import { uploadCandidateResumeSchema } from "@destaworks/contracts/validation/candidate";
import { requireUser } from "@destaworks/auth/guards";
import { apiHandler, json } from "@destaworks/integrations/http/api-handler";
import { checkRateLimit } from "@destaworks/integrations/http/rate-limit";
import { resumeService } from "@destaworks/application/resume.service";
import { toDocumentSummaryDTO } from "@destaworks/application/candidate.dto";
import type { DocumentSummaryDTO } from "@destaworks/contracts/validation/candidate";

/** Wire shape of `POST /api/candidates/:id/resume` — the newly attached document summary. */
export interface PostCandidateResumeResponse {
  document: DocumentSummaryDTO;
}

/**
 * POST /api/candidates/:id/resume — attach a resume directly to this ALREADY-KNOWN candidate (the
 * detail page's own Resume tab), no AI extraction/matching involved (that's the separate Parse
 * Resume flow, `/api/resume/*`). Guarded by `requireUser()`, same posture as every other candidate
 * mutation route. Rate-limited since a real Storage call may have already backed the upload.
 * 201 on attach, 401 unauth, 404 if the candidate is missing/soft-deleted, 422 on a bad body.
 */
export const POST = apiHandler<{ params: Promise<{ id: string }> }>(async (req, ctx) => {
  const user = await requireUser();
  await checkRateLimit(`candidate-resume-upload:${user.id}`, { limit: 20, windowMs: 60_000 });
  const { id } = await ctx.params;
  const input = uploadCandidateResumeSchema.parse(await req.json());
  const document = await resumeService.attachToCandidate(id, input, user);
  return json<PostCandidateResumeResponse>({ document: toDocumentSummaryDTO(document) }, 201);
});
