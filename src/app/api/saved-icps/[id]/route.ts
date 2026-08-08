import { requireCapability } from "@/server/auth/guards";
import { apiHandler, json } from "@/server/http/api-handler";
import { savedIcpService } from "@/server/services/saved-icp.service";

/**
 * DELETE /api/saved-icps/:id — permanently remove one of the caller's saved ICPs (hard delete,
 * no undo — matches `DELETE /api/saved-views/:id`). 404 if the id doesn't exist or belongs to
 * another user (deliberately indistinguishable — see `saved-icp.service.ts`).
 */
export const DELETE = apiHandler<{ params: Promise<{ id: string }> }>(async (_req, ctx) => {
  const user = await requireCapability("viewClientDiscovery");
  const { id } = await ctx.params;
  return json(await savedIcpService.remove(id, user));
});
