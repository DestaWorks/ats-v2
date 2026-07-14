import { updateOpenRoleSchema } from "@/lib/validation/open-role";
import { requireUser } from "@/server/auth/guards";
import { apiHandler, json } from "@/server/http/api-handler";
import { openRoleService } from "@/server/services/open-role.service";

/** GET /api/roles/:id — one role's detail (role + notes). 404 if missing. */
export const GET = apiHandler<{ params: Promise<{ id: string }> }>(async (_req, ctx) => {
  await requireUser();
  const { id } = await ctx.params;
  return json({ role: await openRoleService.detail(id) });
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
  return json({ role: await openRoleService.update(id, input, user) });
});

/** DELETE /api/roles/:id — HARD delete (legacy `open_role_delete` parity — no undo). */
export const DELETE = apiHandler<{ params: Promise<{ id: string }> }>(async (_req, ctx) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  return json(await openRoleService.remove(id, user));
});
