import { addMeetingSchema } from "@destaworks/contracts/validation/client";
import type * as Contract from "@destaworks/contracts/http/crm";
import { requireCapability } from "@destaworks/auth/guards";
import { apiHandler, json } from "@destaworks/integrations/http/api-handler";
import { clientService } from "@destaworks/application/client.service";

/** Wire shape of `POST /api/crm/clients/:id/meetings`. */
export type PostCrmClientMeetingResponse = Contract.PostCrmClientMeetingResponse;

/** POST /api/crm/clients/:id/meetings — log a meeting for this client. Gated `viewCrm`. */
export const POST = apiHandler<{ params: Promise<{ id: string }> }>(async (req, ctx) => {
  const user = await requireCapability("viewCrm");
  const { id } = await ctx.params;
  const input = addMeetingSchema.parse(await req.json());
  const meeting = await clientService.addMeeting(id, input, user);
  return json<PostCrmClientMeetingResponse>({ meeting }, 201);
});
