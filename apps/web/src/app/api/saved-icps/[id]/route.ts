import type * as Contract from "@destaworks/contracts/http/saved-icp";
import { requireCapability } from "@destaworks/auth/guards";
import { apiHandler, json } from "@destaworks/integrations/http/api-handler";
import { savedIcpService } from "@destaworks/application/saved-icp.service";

/** Response body of `DELETE /api/saved-icps/:id` — the id that was removed. */
export type DeleteSavedIcpResponse = Contract.DeleteSavedIcpResponse;

/**
 * DELETE /api/saved-icps/:id — permanently remove one of the caller's saved ICPs (hard delete,
 * no undo — matches `DELETE /api/saved-views/:id`). 404 if the id doesn't exist or belongs to
 * another user (deliberately indistinguishable — see `saved-icp.service.ts`).
 */
export const DELETE = apiHandler<{ params: Promise<{ id: string }> }>(async (_req, ctx) => {
  const user = await requireCapability("viewClientDiscovery");
  const { id } = await ctx.params;
  return json<DeleteSavedIcpResponse>(await savedIcpService.remove(id, user));
});
