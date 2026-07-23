import { updateContactSchema } from "@/lib/validation/client";
import { requireCapability } from "@/server/auth/guards";
import { apiHandler, json } from "@/server/http/api-handler";
import { clientService } from "@/server/services/client.service";

/**
 * PATCH /api/crm/clients/:id/contacts/:contactId — edit a contact (incl. marking "left"). DELETE
 * soft-deletes it. Both gated `viewCrm`. 404 if the contact doesn't belong to this client.
 */
export const PATCH = apiHandler<{ params: Promise<{ id: string; contactId: string }> }>(
  async (req, ctx) => {
    const user = await requireCapability("viewCrm");
    const { id, contactId } = await ctx.params;
    const input = updateContactSchema.parse(await req.json());
    const contact = await clientService.updateContact(id, contactId, input, user);
    return json({ contact });
  },
);

export const DELETE = apiHandler<{ params: Promise<{ id: string; contactId: string }> }>(
  async (_req, ctx) => {
    const user = await requireCapability("viewCrm");
    const { id, contactId } = await ctx.params;
    await clientService.removeContact(id, contactId, user);
    return json({ ok: true, id: contactId });
  },
);
