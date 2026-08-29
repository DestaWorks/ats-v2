import { triageSchema, type TriageResultDTO } from "@destaworks/contracts/validation/inbound";
import { requireUser } from "@destaworks/auth/guards";
import { apiHandler, json } from "@destaworks/integrations/http/api-handler";
import { checkRateLimit } from "@destaworks/integrations/http/rate-limit";
import { inboundService } from "@destaworks/application/inbound.service";

/** Response body of `POST /api/inbound/triage`. */
export type PostInboundTriageResponse = TriageResultDTO;

/**
 * POST /api/inbound/triage — extract + dedupe + client-match a pasted inbound reply (Wave 2.8).
 * Read-only: no lead is created. Guarded by `requireUser()` (sourcing is open to any signed-in
 * operator, L-7). 503 FEATURE_DISABLED if AI is unconfigured; 502 EXTRACTION_FAILED on a failed
 * model call; 429 RATE_LIMITED if the provider is busy.
 *
 * COST: each call is a paid LLM request, so it's rate-limited per user (SECURITY-AUDIT-APP.md H5
 * — this endpoint previously had none, unlike resume/extract and the Discover/Smarter-Sourcing
 * services), matching resume/extract's limit.
 */
export const POST = apiHandler(async (req: Request) => {
  const user = await requireUser();
  await checkRateLimit(`inbound-triage:${user.user.id}`, { limit: 20, windowMs: 60_000 });
  const input = triageSchema.parse(await req.json());
  const result = await inboundService.triage(input, user);
  return json<PostInboundTriageResponse>(result);
});
