import { requireCapability } from "@destaworks/auth/guards";
import { apiHandler, json } from "@destaworks/integrations/http/api-handler";
import { adminUserService } from "@destaworks/application/admin-user.service";
import type { AcknowledgedIdDTO } from "@destaworks/contracts/api";

/** Response body of `DELETE /api/admin/users/:id` — the id that was removed. */
export type DeleteAdminUserResponse = AcknowledgedIdDTO;

/** DELETE /api/admin/users/:id — remove an account outright. Gated `manageUsers`. */
export const DELETE = apiHandler<{ params: Promise<{ id: string }> }>(async (_req, ctx) => {
  const actor = await requireCapability("manageUsers");
  const { id } = await ctx.params;
  await adminUserService.remove(id, actor.id);
  return json<DeleteAdminUserResponse>({ ok: true, id });
});
