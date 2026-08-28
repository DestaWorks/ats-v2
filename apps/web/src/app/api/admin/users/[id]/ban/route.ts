import { banUserSchema, type AdminUserEnvelopeDTO } from "@destaworks/contracts/validation/admin";
import { requireCapability } from "@destaworks/auth/guards";
import { apiHandler, json } from "@destaworks/integrations/http/api-handler";
import { adminUserService } from "@destaworks/application/admin-user.service";

/** Response body of `POST /api/admin/users/:id/ban` — the account in its banned state. */
export type PostAdminUserBanResponse = AdminUserEnvelopeDTO;

/**
 * POST /api/admin/users/:id/ban — ban an account (real DB-level enforcement at sign-in, unlike
 * legacy's client-side-only "blocked" check). Gated `manageUsers`.
 */
export const POST = apiHandler<{ params: Promise<{ id: string }> }>(async (req, ctx) => {
  const actor = await requireCapability("manageUsers");
  const { id } = await ctx.params;
  const input = banUserSchema.parse(await req.json());
  const user = await adminUserService.ban(id, input, actor.id);
  return json<PostAdminUserBanResponse>({ user });
});
