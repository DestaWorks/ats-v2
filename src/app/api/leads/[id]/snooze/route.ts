import { snoozeLeadSchema } from "@/lib/validation/lead";
import { requireUser } from "@/server/auth/guards";
import { apiHandler, json } from "@/server/http/api-handler";
import { leadService } from "@/server/services/lead.service";

/**
 * POST /api/leads/:id/snooze — snooze (`{ until: date }`) or wake (`{ until: null }`) a lead
 * (`source_lead_snooze` parity). Guarded by `requireUser()`. Returns the fresh lead detail.
 * 404 missing/soft-deleted; 409 promoted; 422 bad body; 401 unauth.
 */
export const POST = apiHandler<{ params: Promise<{ id: string }> }>(async (req, ctx) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  const input = snoozeLeadSchema.parse(await req.json());
  return json({ lead: await leadService.snooze(id, input.until, user) });
});
