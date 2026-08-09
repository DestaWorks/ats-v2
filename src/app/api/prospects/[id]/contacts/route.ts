import { addProspectContactSchema } from "@/lib/validation/prospect";
import { requireCapability } from "@/server/auth/guards";
import { apiHandler, json } from "@/server/http/api-handler";
import { prospectService } from "@/server/services/prospect.service";

/**
 * POST /api/prospects/:id/contacts — add a contact manually. A converted ("Client") prospect is
 * terminal -> 409 CONFLICT.
 */
export const POST = apiHandler<{ params: Promise<{ id: string }> }>(async (req, ctx) => {
  const user = await requireCapability("viewClientDiscovery");
  const { id } = await ctx.params;
  const input = addProspectContactSchema.parse(await req.json());
  const prospect = await prospectService.addContactManual(id, input, user);
  return json({ prospect }, 201);
});
