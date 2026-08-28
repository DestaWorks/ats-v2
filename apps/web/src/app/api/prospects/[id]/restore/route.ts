import type { ProspectEnvelope } from "@destaworks/contracts/validation/prospect";
import { requireCapability } from "@destaworks/auth/guards";
import { apiHandler, json } from "@destaworks/integrations/http/api-handler";
import { prospectService } from "@destaworks/application/prospect.service";

/** Response body of `POST /api/prospects/:id/restore`. */
export type PostProspectRestoreResponse = ProspectEnvelope;

/**
 * POST /api/prospects/:id/restore — restore a soft-deleted prospect (clears the delete markers;
 * status untouched). 404 missing; 409 CONFLICT (prospect is not deleted).
 */
export const POST = apiHandler<{ params: Promise<{ id: string }> }>(async (_req, ctx) => {
  const user = await requireCapability("viewClientDiscovery");
  const { id } = await ctx.params;
  const prospect = await prospectService.restore(id, user);
  return json<PostProspectRestoreResponse>({ prospect });
});
