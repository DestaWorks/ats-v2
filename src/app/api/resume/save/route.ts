import { saveResumeInputSchema } from "@/lib/validation/resume";
import { requireUser } from "@/server/auth/guards";
import { apiHandler, json } from "@/server/http/api-handler";
import { resumeService } from "@/server/services/resume.service";
import type { CandidateDTO } from "@/server/services/candidate.dto";
import type { DocumentDTO } from "@/server/services/document.dto";

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
