import { updateBlockerSchema } from "@destaworks/contracts/validation/client";
import type * as Contract from "@destaworks/contracts/http/crm";
import { requireCapability } from "@destaworks/auth/guards";
import { apiHandler, json } from "@destaworks/integrations/http/api-handler";
import { clientService } from "@destaworks/application/client.service";

/** Wire shape of `PATCH /api/crm/clients/:id/deals/:dealId/blockers/:blockerId`. */
export type PatchCrmDealBlockerResponse = Contract.PatchCrmDealBlockerResponse;

/** Wire shape of `DELETE /api/crm/clients/:id/deals/:dealId/blockers/:blockerId`. */
export type DeleteCrmDealBlockerResponse = Contract.DeleteCrmDealBlockerResponse;

/**
 * PATCH /api/crm/clients/:id/deals/:dealId/blockers/:blockerId — toggle `resolved` (stamps/clears
 * `resolvedAt` server-side). DELETE removes it outright. Both gated `viewCrm`.
 */
export const PATCH = apiHandler<{
  params: Promise<{ id: string; dealId: string; blockerId: string }>;
}>(async (req, ctx) => {
  const user = await requireCapability("viewCrm");
  const { id, dealId, blockerId } = await ctx.params;
  const input = updateBlockerSchema.parse(await req.json());
  const blocker = await clientService.updateBlocker(id, dealId, blockerId, input, user);
  return json<PatchCrmDealBlockerResponse>({ blocker });
});

export const DELETE = apiHandler<{
  params: Promise<{ id: string; dealId: string; blockerId: string }>;
}>(async (_req, ctx) => {
  const user = await requireCapability("viewCrm");
  const { id, dealId, blockerId } = await ctx.params;
  await clientService.removeBlocker(id, dealId, blockerId, user);
  return json<DeleteCrmDealBlockerResponse>({ ok: true, id: blockerId });
});
