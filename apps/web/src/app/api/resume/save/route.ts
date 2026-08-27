import { saveResumeInputSchema } from "@destaworks/contracts/validation/resume";
import { requireUser } from "@destaworks/auth/guards";
import { apiHandler, json } from "@destaworks/integrations/http/api-handler";
import { resumeService } from "@destaworks/application/resume.service";
import type { CandidateDTO } from "@destaworks/application/candidate.dto";
import type { DocumentDTO } from "@destaworks/application/document.dto";

/** Wire shape of `POST /api/resume/save` — the attached-or-created candidate + its document. */
export interface PostResumeSaveResponse {
  candidate: CandidateDTO;
  document: DocumentDTO;
}

/**
 * POST /api/resume/save — persist a reviewed resume: attach to an existing candidate or create a
 * new one, store the document, and audit — all in one transaction. Guarded by `requireUser()`.
 * The match (and any `confirmedCandidateId`) is recomputed server-side; the client is never trusted.
 */
export const POST = apiHandler(async (req: Request) => {
  const user = await requireUser();
  const input = saveResumeInputSchema.parse(await req.json());
  const result = await resumeService.save(input, user);
  return json<PostResumeSaveResponse>(result);
});
