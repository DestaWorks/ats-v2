import type * as Contract from "@destaworks/contracts/http/crm";
import { requireCapability } from "@destaworks/auth/guards";
import { apiHandler, json } from "@destaworks/integrations/http/api-handler";
import { clientService } from "@destaworks/application/client.service";

/** Wire shape of `DELETE /api/crm/clients/:id/meetings/:meetingId`. */
export type DeleteCrmClientMeetingResponse = Contract.DeleteCrmClientMeetingResponse;

/**
 * DELETE /api/crm/clients/:id/meetings/:meetingId — soft-delete a logged meeting (correction
 * only — meetings have no edit endpoint, matching legacy's genuine immutability). Gated `viewCrm`.
 */
export const DELETE = apiHandler<{ params: Promise<{ id: string; meetingId: string }> }>(
  async (_req, ctx) => {
    const user = await requireCapability("viewCrm");
    const { id, meetingId } = await ctx.params;
    await clientService.removeMeeting(id, meetingId, user);
    return json<DeleteCrmClientMeetingResponse>({ ok: true, id: meetingId });
  },
);
