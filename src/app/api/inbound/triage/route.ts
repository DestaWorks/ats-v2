import { triageSchema } from "@/lib/validation/inbound";
import { requireUser } from "@/server/auth/guards";
import { apiHandler, json } from "@/server/http/api-handler";
import { inboundService } from "@/server/services/inbound.service";

/**
 * POST /api/inbound/triage — extract + dedupe + client-match a pasted inbound reply (Wave 2.8).
 * Read-only: no lead is created. Guarded by `requireUser()` (sourcing is open to any signed-in
 * operator, L-7). 503 FEATURE_DISABLED if AI is unconfigured; 502 EXTRACTION_FAILED on a failed
 * model call; 429 RATE_LIMITED if the provider is busy.
 */
export const POST = apiHandler(async (req: Request) => {
  await requireUser();
  const input = triageSchema.parse(await req.json());
  const result = await inboundService.triage(input);
  return json(result);
});
