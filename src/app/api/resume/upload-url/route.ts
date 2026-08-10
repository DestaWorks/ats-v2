import { requestResumeUploadUrlSchema } from "@/lib/validation/resume";
import { requireUser } from "@/server/auth/guards";
import { apiHandler, json } from "@/server/http/api-handler";
import { checkRateLimit } from "@/server/http/rate-limit";
import { resumeService } from "@/server/services/resume.service";

/**
 * POST /api/resume/upload-url — a short-lived Supabase Storage URL the browser PUTs the raw
 * resume bytes to directly (Wave 6); the file never passes through this server. Guarded by
 * `requireUser()`, same posture as the rest of the resume flow. Rate-limited (same tier as
 * `/api/resume/extract`) since a real Storage call backs each request.
 */
export const POST = apiHandler(async (req: Request) => {
  const user = await requireUser();
  checkRateLimit(`resume-upload-url:${user.id}`, { limit: 20, windowMs: 60_000 });
  const input = requestResumeUploadUrlSchema.parse(await req.json());
  return json(await resumeService.requestUploadUrl(input));
});
