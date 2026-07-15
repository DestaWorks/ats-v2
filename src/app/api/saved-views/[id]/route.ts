import { requireUser } from "@/server/auth/guards";
import { apiHandler, json } from "@/server/http/api-handler";
import { savedViewService } from "@/server/services/saved-view.service";

/**
 * DELETE /api/saved-views/:id — permanently remove one of the caller's saved views (hard
 * delete, no undo — matches legacy's ×-with-confirm). 404 if the id doesn't exist or belongs to
 * another user (deliberately indistinguishable — see `saved-view.service.ts`).
 */
export const DELETE = apiHandler<{ params: Promise<{ id: string }> }>(async (_req, ctx) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  return json(await savedViewService.remove(id, user));
});
