import { parseResumeInputSchema } from "@/lib/validation/resume";
import { requireUser } from "@/server/auth/guards";
import { apiHandler, json } from "@/server/http/api-handler";
import { checkRateLimit } from "@/server/http/rate-limit";
import { resumeService } from "@/server/services/resume.service";

/**
 * POST /api/resume/extract — Claude structured extraction of a pasted/pdf.js-extracted résumé.
 * Guarded by `requireUser()` (any signed-in user, same posture as the candidate pipeline). Writes
 * NOTHING — returns the validated structured data + the server-computed match for the review UI.
 * When the key is absent the service throws `FEATURE_DISABLED` (503), mapped by `apiHandler`.
 *
 * COST: each call is a paid LLM request, so it is rate-limited per user (best-effort, in-memory —
 * see `server/http/rate-limit`) before the extraction runs.
 */
export const POST = apiHandler(async (req: Request) => {
  const user = await requireUser();
  checkRateLimit(`resume-extract:${user.id}`, { limit: 20, windowMs: 60_000 });
  const input = parseResumeInputSchema.parse(await req.json());
  const result = await resumeService.extract(input);
  return json(result);
});
