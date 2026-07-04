import { saveResumeInputSchema } from "@/lib/validation/resume";
import { requireUser } from "@/server/auth/guards";
import { apiHandler, json } from "@/server/http/api-handler";
import { resumeService } from "@/server/services/resume.service";

/**
 * POST /api/resume/save — persist a reviewed résumé: attach to an existing candidate or create a
 * new one, store the document, and audit — all in one transaction. Guarded by `requireUser()`.
 * The match (and any `confirmedCandidateId`) is recomputed server-side; the client is never trusted.
 */
export const POST = apiHandler(async (req: Request) => {
  const user = await requireUser();
  const input = saveResumeInputSchema.parse(await req.json());
  const result = await resumeService.save(input, user);
  return json(result);
});
