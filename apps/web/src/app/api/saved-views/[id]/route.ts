import type * as Contract from "@destaworks/contracts/http/saved-view";
import { requireUser } from "@destaworks/auth/guards";
import { apiHandler, json } from "@destaworks/integrations/http/api-handler";
import { savedViewService } from "@destaworks/application/saved-view.service";

/** Response body of `DELETE /api/saved-views/:id` — the id that was removed. */
export type DeleteSavedViewResponse = Contract.DeleteSavedViewResponse;

/**
 * DELETE /api/saved-views/:id — permanently remove one of the caller's saved views (hard
 * delete, no undo — matches legacy's ×-with-confirm). 404 if the id doesn't exist or belongs to
 * another user (deliberately indistinguishable — see `saved-view.service.ts`).
 */
export const DELETE = apiHandler<{ params: Promise<{ id: string }> }>(async (_req, ctx) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  return json<DeleteSavedViewResponse>(await savedViewService.remove(id, user));
});
