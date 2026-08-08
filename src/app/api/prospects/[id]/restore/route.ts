import { requireCapability } from "@/server/auth/guards";
import { apiHandler, json } from "@/server/http/api-handler";
import { prospectService } from "@/server/services/prospect.service";

/**
 * POST /api/prospects/:id/restore — restore a soft-deleted prospect (clears the delete markers;
 * status untouched). 404 missing; 409 CONFLICT (prospect is not deleted).
 */
export const POST = apiHandler<{ params: Promise<{ id: string }> }>(async (_req, ctx) => {
  const user = await requireCapability("viewClientDiscovery");
  const { id } = await ctx.params;
  const prospect = await prospectService.restore(id, user);
  return json({ prospect });
});
