import { updateOutreachSchema } from "@/lib/validation/lead";
import { requireUser } from "@/server/auth/guards";
import { apiHandler, json } from "@/server/http/api-handler";
import { leadService } from "@/server/services/lead.service";

/**
 * PATCH /api/leads/:id/outreach/:attemptId — edit one logged attempt
 * (`source_lead_edit_outreach` parity; legacy had no role gate — any operator, audited).
 * Editing never touches the lead's status. Returns the fresh lead detail.
 * 404 missing lead OR attempt-not-under-this-lead; 422 empty/bad body; 401 unauth.
 */
export const PATCH = apiHandler<{ params: Promise<{ id: string; attemptId: string }> }>(
  async (req, ctx) => {
    const user = await requireUser();
    const { id, attemptId } = await ctx.params;
    const input = updateOutreachSchema.parse(await req.json());
    return json({ lead: await leadService.updateOutreach(id, attemptId, input, user) });
  },
);

/**
 * DELETE /api/leads/:id/outreach/:attemptId — delete one logged attempt
 * (`source_lead_delete_outreach` parity). The denormalized count/lastOutreachAt re-sync; the
 * status is NOT regressed. Returns the fresh lead detail. 404/401 as PATCH.
 */
export const DELETE = apiHandler<{ params: Promise<{ id: string; attemptId: string }> }>(
  async (_req, ctx) => {
    const user = await requireUser();
    const { id, attemptId } = await ctx.params;
    return json({ lead: await leadService.deleteOutreach(id, attemptId, user) });
  },
);
