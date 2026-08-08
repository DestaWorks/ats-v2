import { requireCapability } from "@/server/auth/guards";
import { apiHandler, json } from "@/server/http/api-handler";
import { prospectService } from "@/server/services/prospect.service";

/**
 * DELETE /api/prospects/:id/contacts/:contactId — remove one contact, scoped to its prospect (a
 * contact id under a different prospect -> 404, the repo scopes the write).
 */
export const DELETE = apiHandler<{ params: Promise<{ id: string; contactId: string }> }>(
  async (_req, ctx) => {
    const user = await requireCapability("viewClientDiscovery");
    const { id, contactId } = await ctx.params;
    const prospect = await prospectService.deleteContact(id, contactId, user);
    return json({ prospect });
  },
);
