import { updateDealSchema } from "@/lib/validation/client";
import { requireCapability } from "@/server/auth/guards";
import { apiHandler, json } from "@/server/http/api-handler";
import { clientService } from "@/server/services/client.service";

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
    return json({ deal });
  },
);

export const DELETE = apiHandler<{ params: Promise<{ id: string; dealId: string }> }>(
  async (_req, ctx) => {
    const user = await requireCapability("viewCrm");
    const { id, dealId } = await ctx.params;
    await clientService.removeDeal(id, dealId, user);
    return json({ ok: true, id: dealId });
  },
);
