import {
  updateOpenRoleSchema,
  type DeleteRoleResponse as DeleteRoleContract,
  type OpenRoleEnvelope,
} from "@destaworks/contracts/validation/open-role";
import { requireUser, requireCapability } from "@destaworks/auth/guards";
import { apiHandler, json } from "@destaworks/integrations/http/api-handler";
import { openRoleService } from "@destaworks/application/open-role.service";

/** Response body of `GET /api/roles/:id`. */
export type GetRoleResponse = OpenRoleEnvelope;

/** Response body of `PATCH /api/roles/:id`. */
export type PatchRoleResponse = OpenRoleEnvelope;

/** Response body of `DELETE /api/roles/:id` — the hard-deleted role's id only. */
export type DeleteRoleResponse = DeleteRoleContract;

/** GET /api/roles/:id — one role's detail (role + notes). 404 if missing. */
export const GET = apiHandler<{ params: Promise<{ id: string }> }>(async (_req, ctx) => {
  await requireUser();
  const { id } = await ctx.params;
  return json<GetRoleResponse>({ role: await openRoleService.detail(id) });
});

/**
 * PATCH /api/roles/:id — edit any role field, INCLUDING `status`/`priority` (legacy has no gate
 * machine on roles). Flipping to/from Filled/Closed stamps/clears `closedAt` server-side. Returns
 * the fresh detail. 404 missing; 422 bad body; 401 unauth.
 */
export const PATCH = apiHandler<{ params: Promise<{ id: string }> }>(async (req, ctx) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  const input = updateOpenRoleSchema.parse(await req.json());
  return json<PatchRoleResponse>({ role: await openRoleService.update(id, input, user) });
});

/**
 * DELETE /api/roles/:id — HARD delete (legacy `open_role_delete` parity — no undo). Gated behind
 * `deleteOpenRole` (Owner/Admin only), matching the equally-irreversible candidate purge's
 * capability gate (SECURITY-AUDIT-APP.md H7) rather than the open-to-any-operator default.
 */
export const DELETE = apiHandler<{ params: Promise<{ id: string }> }>(async (_req, ctx) => {
  const user = await requireCapability("deleteOpenRole");
  const { id } = await ctx.params;
  return json<DeleteRoleResponse>(await openRoleService.remove(id, user));
});
