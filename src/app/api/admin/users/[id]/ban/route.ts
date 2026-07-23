import { banUserSchema } from "@/lib/validation/admin";
import { requireCapability } from "@/server/auth/guards";
import { apiHandler, json } from "@/server/http/api-handler";
import { adminUserService } from "@/server/services/admin-user.service";

/**
 * POST /api/admin/users/:id/ban — ban an account (real DB-level enforcement at sign-in, unlike
 * legacy's client-side-only "blocked" check). Gated `manageUsers`.
 */
export const POST = apiHandler<{ params: Promise<{ id: string }> }>(async (req, ctx) => {
  await requireCapability("manageUsers");
  const { id } = await ctx.params;
  const input = banUserSchema.parse(await req.json());
  const user = await adminUserService.ban(id, input);
  return json({ user });
});
