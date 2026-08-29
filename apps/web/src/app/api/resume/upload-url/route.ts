import { requestResumeUploadUrlSchema } from "@destaworks/contracts/validation/resume";
import { requireUser } from "@destaworks/auth/guards";
import { apiHandler, json } from "@destaworks/integrations/http/api-handler";
import { checkRateLimit } from "@destaworks/integrations/http/rate-limit";
import { resumeService } from "@destaworks/application/resume.service";
import type { ResumeUploadUrlDTO } from "@destaworks/contracts/validation/resume";

/** Wire shape of `POST /api/resume/upload-url` — the short-lived signed PUT target + its key. */
export type PostResumeUploadUrlResponse = ResumeUploadUrlDTO;

/**
 * POST /api/resume/upload-url — a short-lived Supabase Storage URL the browser PUTs the raw
 * resume bytes to directly (Wave 6); the file never passes through this server. Guarded by
 * `requireUser()`, same posture as the rest of the resume flow. Rate-limited (same tier as
 * `/api/resume/extract`) since a real Storage call backs each request.
 */
export const POST = apiHandler(async (req: Request) => {
  const user = await requireUser();
  await checkRateLimit(`resume-upload-url:${user.user.id}`, { limit: 20, windowMs: 60_000 });
  const input = requestResumeUploadUrlSchema.parse(await req.json());
  return json<PostResumeUploadUrlResponse>(await resumeService.requestUploadUrl(user, input));
});
