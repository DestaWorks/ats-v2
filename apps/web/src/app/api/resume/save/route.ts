import { saveResumeInputSchema } from "@destaworks/contracts/validation/resume";
import { requireUser } from "@destaworks/auth/guards";
import { apiHandler, json } from "@destaworks/integrations/http/api-handler";
import { resumeService } from "@destaworks/application/resume.service";
import type { ResumeSaveEnvelope } from "@destaworks/application/candidate.wire";

/** Wire shape of `POST /api/resume/save` — the attached-or-created candidate + its document. */
export type PostResumeSaveResponse = ResumeSaveEnvelope;

/**
 * POST /api/resume/save — persist a reviewed resume: attach to an existing candidate or create a
 * new one, store the document, and audit — all in one transaction. Guarded by `requireUser()`.
 * The match (and any `confirmedCandidateId`) is recomputed server-side; the client is never trusted.
 */
export const POST = apiHandler(async (req: Request) => {
  const user = await requireUser();
  const input = saveResumeInputSchema.parse(await req.json());
  const result = await resumeService.save(user, input);
  return json<PostResumeSaveResponse>(result);
});
