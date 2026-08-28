import { requireCapability } from "@destaworks/auth/guards";
import { apiHandler, json } from "@destaworks/integrations/http/api-handler";
import { resumeService } from "@destaworks/application/resume.service";
import type { DownloadUrlEnvelope } from "@destaworks/contracts/validation/envelopes";

/** Wire shape of `GET /api/documents/:id/download-url` — a fresh, short-lived signed URL. */
export type GetDocumentDownloadUrlResponse = DownloadUrlEnvelope;

/**
 * GET /api/documents/:id/download-url — a fresh, short-lived signed URL for a document's stored
 * resume bytes (Wave 6). Gated `viewCredentials` — the SAME tier already protecting
 * `extractedText`/`extractedData`, since the original file carries the same PII/PHI. 404s when
 * the document has no `storageKey` (metadata-only or legacy-link rows).
 */
export const GET = apiHandler<{ params: Promise<{ id: string }> }>(async (_req, ctx) => {
  await requireCapability("viewCredentials");
  const { id } = await ctx.params;
  return json<GetDocumentDownloadUrlResponse>(await resumeService.getDownloadUrl(id));
});
