import { createDealSchema, type DealDTO } from "@destaworks/contracts/validation/client";
import { requireCapability } from "@destaworks/auth/guards";
import { apiHandler, json } from "@destaworks/integrations/http/api-handler";
import { clientService } from "@destaworks/application/client.service";

/** Wire shape of `POST /api/crm/clients/:id/deals`. */
export type PostCrmDealResponse = { deal: DealDTO };

/** POST /api/crm/clients/:id/deals — add a deal for this client. Gated `viewCrm`. */
export const POST = apiHandler<{ params: Promise<{ id: string }> }>(async (req, ctx) => {
  const user = await requireCapability("viewCrm");
  const { id } = await ctx.params;
  const input = createDealSchema.parse(await req.json());
  const deal = await clientService.addDeal(id, input, user);
  return json<PostCrmDealResponse>({ deal }, 201);
});
