import { addContactSchema, type ClientContactDTO } from "@destaworks/contracts/validation/client";
import { requireCapability } from "@destaworks/auth/guards";
import { apiHandler, json } from "@destaworks/integrations/http/api-handler";
import { clientService } from "@destaworks/application/client.service";

/** Wire shape of `POST /api/crm/clients/:id/contacts`. */
export type PostCrmClientContactResponse = { contact: ClientContactDTO };

/** POST /api/crm/clients/:id/contacts — add a contact to this client. Gated `viewCrm`. */
export const POST = apiHandler<{ params: Promise<{ id: string }> }>(async (req, ctx) => {
  const user = await requireCapability("viewCrm");
  const { id } = await ctx.params;
  const input = addContactSchema.parse(await req.json());
  const contact = await clientService.addContact(id, input, user);
  return json<PostCrmClientContactResponse>({ contact }, 201);
});
