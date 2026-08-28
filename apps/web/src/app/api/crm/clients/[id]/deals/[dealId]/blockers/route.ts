import { addBlockerSchema } from "@destaworks/contracts/validation/client";
import type * as Contract from "@destaworks/contracts/http/crm";
import { requireCapability } from "@destaworks/auth/guards";
import { apiHandler, json } from "@destaworks/integrations/http/api-handler";
import { clientService } from "@destaworks/application/client.service";

/** Wire shape of `POST /api/crm/clients/:id/deals/:dealId/blockers`. */
export type PostCrmDealBlockerResponse = Contract.PostCrmDealBlockerResponse;

/** POST /api/crm/clients/:id/deals/:dealId/blockers — add a blocker to this deal. Gated `viewCrm`. */
export const POST = apiHandler<{ params: Promise<{ id: string; dealId: string }> }>(
  async (req, ctx) => {
    const user = await requireCapability("viewCrm");
    const { id, dealId } = await ctx.params;
    const input = addBlockerSchema.parse(await req.json());
    const blocker = await clientService.addBlocker(id, dealId, input, user);
    return json<PostCrmDealBlockerResponse>({ blocker }, 201);
  },
);
