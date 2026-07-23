import { addContactSchema } from "@/lib/validation/client";
import { requireCapability } from "@/server/auth/guards";
import { apiHandler, json } from "@/server/http/api-handler";
import { clientService } from "@/server/services/client.service";

/** POST /api/crm/clients/:id/contacts — add a contact to this client. Gated `viewCrm`. */
export const POST = apiHandler<{ params: Promise<{ id: string }> }>(async (req, ctx) => {
  const user = await requireCapability("viewCrm");
  const { id } = await ctx.params;
  const input = addContactSchema.parse(await req.json());
  const contact = await clientService.addContact(id, input, user);
  return json({ contact }, 201);
});
