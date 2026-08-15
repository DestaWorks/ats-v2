import { requireCapability } from "@/server/auth/guards";
import { apiHandler, json } from "@/server/http/api-handler";
import { adminUserService } from "@/server/services/admin-user.service";

/** DELETE /api/admin/users/:id — remove an account outright. Gated `manageUsers`. */
export const DELETE = apiHandler<{ params: Promise<{ id: string }> }>(async (_req, ctx) => {
  const actor = await requireCapability("manageUsers");
  const { id } = await ctx.params;
  await adminUserService.remove(id, actor.id);
  return json({ ok: true, id });
});
