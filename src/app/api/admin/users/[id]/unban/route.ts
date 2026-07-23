import { requireCapability } from "@/server/auth/guards";
import { apiHandler, json } from "@/server/http/api-handler";
import { adminUserService } from "@/server/services/admin-user.service";

/** POST /api/admin/users/:id/unban — lift a ban. Gated `manageUsers`. */
export const POST = apiHandler<{ params: Promise<{ id: string }> }>(async (_req, ctx) => {
  await requireCapability("manageUsers");
  const { id } = await ctx.params;
  const user = await adminUserService.unban(id);
  return json({ user });
});
