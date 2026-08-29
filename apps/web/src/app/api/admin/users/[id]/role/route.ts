import { setRoleSchema, type AdminUserEnvelopeDTO } from "@destaworks/contracts/validation/admin";
import { requireCapability } from "@destaworks/auth/guards";
import { apiHandler, json } from "@destaworks/integrations/http/api-handler";
import { adminUserService } from "@destaworks/application/admin-user.service";

/** Response body of `PATCH /api/admin/users/:id/role` — the account with its new role. */
export type PatchAdminUserRoleResponse = AdminUserEnvelopeDTO;

/** PATCH /api/admin/users/:id/role — set a user's role. Gated `manageRoles`. */
export const PATCH = apiHandler<{ params: Promise<{ id: string }> }>(async (req, ctx) => {
  const actor = await requireCapability("manageRoles");
  const { id } = await ctx.params;
  const input = setRoleSchema.parse(await req.json());
  const user = await adminUserService.setRole(id, input.role, actor.user.id);
  return json<PatchAdminUserRoleResponse>({ user });
});
