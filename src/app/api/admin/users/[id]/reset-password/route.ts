import { requireCapability } from "@/server/auth/guards";
import { apiHandler, json } from "@/server/http/api-handler";
import { adminUserService } from "@/server/services/admin-user.service";

/**
 * POST /api/admin/users/:id/reset-password — generates a new password and returns it ONCE
 * (never persisted/emailed in plaintext, unlike legacy). Gated `manageUsers`.
 */
export const POST = apiHandler<{ params: Promise<{ id: string }> }>(async (_req, ctx) => {
  await requireCapability("manageUsers");
  const { id } = await ctx.params;
  const result = await adminUserService.resetPassword(id);
  return json(result);
});
