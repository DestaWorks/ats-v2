import {
  addProspectContactSchema,
  type ProspectEnvelope,
} from "@destaworks/contracts/validation/prospect";
import { requireCapability } from "@destaworks/auth/guards";
import { apiHandler, json } from "@destaworks/integrations/http/api-handler";
import { prospectService } from "@destaworks/application/prospect.service";

/** Response body of `POST /api/prospects/:id/contacts` — the fresh prospect detail. */
export type PostProspectContactResponse = ProspectEnvelope;

/**
 * POST /api/prospects/:id/contacts — add a contact manually. A converted ("Client") prospect is
 * terminal -> 409 CONFLICT.
 */
export const POST = apiHandler<{ params: Promise<{ id: string }> }>(async (req, ctx) => {
  const user = await requireCapability("viewClientDiscovery");
  const { id } = await ctx.params;
  const input = addProspectContactSchema.parse(await req.json());
  const prospect = await prospectService.addContactManual(id, input, user);
  return json<PostProspectContactResponse>({ prospect }, 201);
});
