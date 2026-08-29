import { requireCapability } from "@destaworks/auth/guards";
import { apiHandler, json } from "@destaworks/integrations/http/api-handler";
import { adminUserService } from "@destaworks/application/admin-user.service";
import type { ResetPasswordDTO } from "@destaworks/contracts/validation/admin";

/** Response body of `POST /api/admin/users/:id/reset-password` — returned once, never persisted. */
export type PostAdminUserResetPasswordResponse = ResetPasswordDTO;

/**
 * POST /api/admin/users/:id/reset-password — generates a new password and returns it ONCE
 * (never persisted/emailed in plaintext, unlike legacy). Gated `manageUsers`.
 */
export const POST = apiHandler<{ params: Promise<{ id: string }> }>(async (_req, ctx) => {
  const actor = await requireCapability("manageUsers");
  const { id } = await ctx.params;
  const result = await adminUserService.resetPassword(actor, id);
  return json<PostAdminUserResetPasswordResponse>(result);
});
