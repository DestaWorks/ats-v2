import { attachInboundSchema } from "@/lib/validation/inbound";
import { requireUser } from "@/server/auth/guards";
import { apiHandler, json } from "@/server/http/api-handler";
import { inboundService } from "@/server/services/inbound.service";

/**
 * POST /api/inbound/attach — the reply belongs to an EXISTING lead (dedupe match, reviewer
 * confirmed): logs the message as an outreach attempt and marks the lead Responded Hot (Wave 2.8).
 * Guarded by `requireUser()` (L-7). 404 if the lead is missing/soft-deleted; 409 if already Promoted.
 */
export const POST = apiHandler(async (req: Request) => {
  const user = await requireUser();
  const input = attachInboundSchema.parse(await req.json());
  const lead = await inboundService.attach(input, user);
  return json({ lead });
});
