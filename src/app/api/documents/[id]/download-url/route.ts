import { requireCapability } from "@/server/auth/guards";
import { apiHandler, json } from "@/server/http/api-handler";
import { resumeService } from "@/server/services/resume.service";

/**
 * GET /api/documents/:id/download-url — a fresh, short-lived signed URL for a document's stored
 * resume bytes (Wave 6). Gated `viewCredentials` — the SAME tier already protecting
 * `extractedText`/`extractedData`, since the original file carries the same PII/PHI. 404s when
 * the document has no `storageKey` (metadata-only or legacy-link rows).
 */
export const GET = apiHandler<{ params: Promise<{ id: string }> }>(async (_req, ctx) => {
  await requireCapability("viewCredentials");
  const { id } = await ctx.params;
  return json(await resumeService.getDownloadUrl(id));
});
