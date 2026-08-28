import { requireCapability } from "@destaworks/auth/guards";
import { apiHandler, json } from "@destaworks/integrations/http/api-handler";
import { adminUserService } from "@destaworks/application/admin-user.service";
import type { AdminUserEnvelopeDTO } from "@destaworks/contracts/validation/admin";

/** Response body of `POST /api/admin/users/:id/unban` — the account with its ban lifted. */
export type PostAdminUserUnbanResponse = AdminUserEnvelopeDTO;

/** POST /api/admin/users/:id/unban — lift a ban. Gated `manageUsers`. */
export const POST = apiHandler<{ params: Promise<{ id: string }> }>(async (_req, ctx) => {
  const actor = await requireCapability("manageUsers");
  const { id } = await ctx.params;
  const user = await adminUserService.unban(id, actor.id);
  return json<PostAdminUserUnbanResponse>({ user });
});
