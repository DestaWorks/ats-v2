import { parseResumeInputSchema } from "@/lib/validation/resume";
import { requireUser } from "@/server/auth/guards";
import { apiHandler, json } from "@/server/http/api-handler";
import { resumeService } from "@/server/services/resume.service";

/**
 * POST /api/resume/extract — Claude structured extraction of a pasted/pdf.js-extracted résumé.
 * Guarded by `requireUser()` (any signed-in user, same posture as the candidate pipeline). Writes
 * NOTHING — returns the validated structured data + the server-computed match for the review UI.
 * When the key is absent the service throws `FEATURE_DISABLED` (503), mapped by `apiHandler`.
 */
export const POST = apiHandler(async (req: Request) => {
  await requireUser();
  const input = parseResumeInputSchema.parse(await req.json());
  const result = await resumeService.extract(input);
  return json(result);
});
