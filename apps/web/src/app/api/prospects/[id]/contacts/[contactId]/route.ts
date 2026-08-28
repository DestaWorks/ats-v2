import type { ProspectEnvelope } from "@destaworks/contracts/validation/prospect";
import { requireCapability } from "@destaworks/auth/guards";
import { apiHandler, json } from "@destaworks/integrations/http/api-handler";
import { prospectService } from "@destaworks/application/prospect.service";

/** Response body of `DELETE /api/prospects/:id/contacts/:contactId` — the fresh prospect detail. */
export type DeleteProspectContactResponse = ProspectEnvelope;

/**
 * DELETE /api/prospects/:id/contacts/:contactId — remove one contact, scoped to its prospect (a
 * contact id under a different prospect -> 404, the repo scopes the write).
 */
export const DELETE = apiHandler<{ params: Promise<{ id: string; contactId: string }> }>(
  async (_req, ctx) => {
    const user = await requireCapability("viewClientDiscovery");
    const { id, contactId } = await ctx.params;
    const prospect = await prospectService.deleteContact(id, contactId, user);
    return json<DeleteProspectContactResponse>({ prospect });
  },
);
