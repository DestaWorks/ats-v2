import { saveMatchProfileSchema } from "@destaworks/contracts/validation/open-role";
import type * as Contract from "@destaworks/contracts/http/open-role";
import { requireUser } from "@destaworks/auth/guards";
import { apiHandler, json } from "@destaworks/integrations/http/api-handler";
import { openRoleService } from "@destaworks/application/open-role.service";

/** Wire shape of `GET /api/client-match-profiles/:clientId`. */
export type GetClientMatchProfileResponse = Contract.GetClientMatchProfileResponse;

/** Wire shape of `PUT /api/client-match-profiles/:clientId`. */
export type PutClientMatchProfileResponse = Contract.PutClientMatchProfileResponse;

/** Wire shape of `DELETE /api/client-match-profiles/:clientId`. */
export type DeleteClientMatchProfileResponse = Contract.DeleteClientMatchProfileResponse;

/** GET /api/client-match-profiles/:clientId — this client's weights, or the system default (`isDefault`). */
export const GET = apiHandler<{ params: Promise<{ clientId: string }> }>(async (_req, ctx) => {
  await requireUser();
  const { clientId } = await ctx.params;
  return json<GetClientMatchProfileResponse>(await openRoleService.getMatchProfile(clientId));
});

/**
 * PUT /api/client-match-profiles/:clientId — upsert this client's active-matcher weight overrides
 * (legacy `cp_save`). LEADERSHIP only (403 otherwise, enforced in the service). Audited.
 */
export const PUT = apiHandler<{ params: Promise<{ clientId: string }> }>(async (req, ctx) => {
  const user = await requireUser();
  const { clientId } = await ctx.params;
  const input = saveMatchProfileSchema.parse(await req.json());
  return json<PutClientMatchProfileResponse>(
    await openRoleService.saveMatchProfile(clientId, input, user),
  );
});

/**
 * DELETE /api/client-match-profiles/:clientId — reset this client to the system default weights.
 * LEADERSHIP only.
 */
export const DELETE = apiHandler<{ params: Promise<{ clientId: string }> }>(async (_req, ctx) => {
  const user = await requireUser();
  const { clientId } = await ctx.params;
  return json<DeleteClientMatchProfileResponse>(
    await openRoleService.deleteMatchProfile(clientId, user),
  );
});
