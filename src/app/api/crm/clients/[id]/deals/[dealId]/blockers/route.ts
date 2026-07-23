import { addBlockerSchema } from "@/lib/validation/client";
import { requireCapability } from "@/server/auth/guards";
import { apiHandler, json } from "@/server/http/api-handler";
import { clientService } from "@/server/services/client.service";

/** POST /api/crm/clients/:id/deals/:dealId/blockers — add a blocker to this deal. Gated `viewCrm`. */
export const POST = apiHandler<{ params: Promise<{ id: string; dealId: string }> }>(
  async (req, ctx) => {
    const user = await requireCapability("viewCrm");
    const { id, dealId } = await ctx.params;
    const input = addBlockerSchema.parse(await req.json());
    const blocker = await clientService.addBlocker(id, dealId, input, user);
    return json({ blocker }, 201);
  },
);
