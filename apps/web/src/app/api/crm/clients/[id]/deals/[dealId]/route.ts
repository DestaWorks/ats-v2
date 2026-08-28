import { updateDealSchema } from "@destaworks/contracts/validation/client";
import type * as Contract from "@destaworks/contracts/http/crm";
import { requireCapability } from "@destaworks/auth/guards";
import { apiHandler, json } from "@destaworks/integrations/http/api-handler";
import { clientService } from "@destaworks/application/client.service";

/** Wire shape of `PATCH /api/crm/clients/:id/deals/:dealId`. */
export type PatchCrmDealResponse = Contract.PatchCrmDealResponse;

/** Wire shape of `DELETE /api/crm/clients/:id/deals/:dealId`. */
export type DeleteCrmDealResponse = Contract.DeleteCrmDealResponse;

/**
 * PATCH /api/crm/clients/:id/deals/:dealId — edit a deal (incl. moving its kanban stage and
 * closing it — `{stage: "Signed"|"Lost", closeReason?, postMortem?}` through this SAME endpoint,
 * which stamps/clears `closedAt` server-side). DELETE soft-deletes it. Both gated `viewCrm`.
 */
export const PATCH = apiHandler<{ params: Promise<{ id: string; dealId: string }> }>(
  async (req, ctx) => {
    const user = await requireCapability("viewCrm");
    const { id, dealId } = await ctx.params;
    const input = updateDealSchema.parse(await req.json());
    const deal = await clientService.updateDeal(id, dealId, input, user);
    return json<PatchCrmDealResponse>({ deal });
  },
);

export const DELETE = apiHandler<{ params: Promise<{ id: string; dealId: string }> }>(
  async (_req, ctx) => {
    const user = await requireCapability("viewCrm");
    const { id, dealId } = await ctx.params;
    await clientService.removeDeal(id, dealId, user);
    return json<DeleteCrmDealResponse>({ ok: true, id: dealId });
  },
);
