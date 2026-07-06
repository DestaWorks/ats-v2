import { requireUser } from "@/server/auth/guards";
import { apiHandler, json } from "@/server/http/api-handler";
import { leadService } from "@/server/services/lead.service";

/**
 * POST /api/leads/:id/restore — restore a soft-deleted lead (clears the delete markers; status and
 * outreach history untouched). Guarded by `requireUser()` (L-7 — sourcing is open to every operator,
 * mirroring candidate restore). Returns the fresh lead detail. 200; 404 missing; 409 CONFLICT (lead
 * is not deleted); 401 unauth.
 */
export const POST = apiHandler<{ params: Promise<{ id: string }> }>(async (_req, ctx) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  const lead = await leadService.restore(id, user);
  return json({ lead });
});
