import { triageSchema } from "@/lib/validation/inbound";
import { requireUser } from "@/server/auth/guards";
import { apiHandler, json } from "@/server/http/api-handler";
import { checkRateLimit } from "@/server/http/rate-limit";
import { inboundService } from "@/server/services/inbound.service";

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
  checkRateLimit(`inbound-triage:${user.id}`, { limit: 20, windowMs: 60_000 });
  const input = triageSchema.parse(await req.json());
  const result = await inboundService.triage(input);
  return json(result);
});
