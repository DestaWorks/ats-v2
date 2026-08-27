import { requireCapability } from "@/server/auth/guards";
import { apiHandler, json } from "@/server/http/api-handler";
import { adminUserService } from "@/server/services/admin-user.service";

/** Response body of `POST /api/admin/users/:id/reset-password` — returned once, never persisted. */
export type PostAdminUserResetPasswordResponse = { generatedPassword: string };

/**
 * POST /api/admin/users/:id/reset-password — generates a new password and returns it ONCE
 * (never persisted/emailed in plaintext, unlike legacy). Gated `manageUsers`.
 */
export const POST = apiHandler<{ params: Promise<{ id: string }> }>(async (_req, ctx) => {
  const actor = await requireCapability("manageUsers");
  const { id } = await ctx.params;
  const result = await adminUserService.resetPassword(id, actor.id);
  return json<PostAdminUserResetPasswordResponse>(result);
});
