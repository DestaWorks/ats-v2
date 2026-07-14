import { saveMatchProfileSchema } from "@/lib/validation/open-role";
import { requireUser } from "@/server/auth/guards";
import { apiHandler, json } from "@/server/http/api-handler";
import { openRoleService } from "@/server/services/open-role.service";

/** GET /api/client-match-profiles/:clientId — this client's weights, or the system default (`isDefault`). */
export const GET = apiHandler<{ params: Promise<{ clientId: string }> }>(async (_req, ctx) => {
  await requireUser();
  const { clientId } = await ctx.params;
  return json(await openRoleService.getMatchProfile(clientId));
});

/**
 * PUT /api/client-match-profiles/:clientId — upsert this client's active-matcher weight overrides
 * (legacy `cp_save`). LEADERSHIP only (403 otherwise, enforced in the service). Audited.
 */
export const PUT = apiHandler<{ params: Promise<{ clientId: string }> }>(async (req, ctx) => {
  const user = await requireUser();
  const { clientId } = await ctx.params;
  const input = saveMatchProfileSchema.parse(await req.json());
  return json(await openRoleService.saveMatchProfile(clientId, input, user));
});

/**
 * DELETE /api/client-match-profiles/:clientId — reset this client to the system default weights.
 * LEADERSHIP only.
 */
export const DELETE = apiHandler<{ params: Promise<{ clientId: string }> }>(async (_req, ctx) => {
  const user = await requireUser();
  const { clientId } = await ctx.params;
  return json(await openRoleService.deleteMatchProfile(clientId, user));
});
