import { addMeetingSchema } from "@/lib/validation/client";
import { requireCapability } from "@/server/auth/guards";
import { apiHandler, json } from "@/server/http/api-handler";
import { clientService } from "@/server/services/client.service";

/** POST /api/crm/clients/:id/meetings — log a meeting for this client. Gated `viewCrm`. */
export const POST = apiHandler<{ params: Promise<{ id: string }> }>(async (req, ctx) => {
  const user = await requireCapability("viewCrm");
  const { id } = await ctx.params;
  const input = addMeetingSchema.parse(await req.json());
  const meeting = await clientService.addMeeting(id, input, user);
  return json({ meeting }, 201);
});
