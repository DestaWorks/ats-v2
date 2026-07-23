import { setRoleSchema } from "@/lib/validation/admin";
import { requireCapability } from "@/server/auth/guards";
import { apiHandler, json } from "@/server/http/api-handler";
import { adminUserService } from "@/server/services/admin-user.service";

/** PATCH /api/admin/users/:id/role — set a user's role. Gated `manageRoles`. */
export const PATCH = apiHandler<{ params: Promise<{ id: string }> }>(async (req, ctx) => {
  await requireCapability("manageRoles");
  const { id } = await ctx.params;
  const input = setRoleSchema.parse(await req.json());
  const user = await adminUserService.setRole(id, input.role);
  return json({ user });
});
