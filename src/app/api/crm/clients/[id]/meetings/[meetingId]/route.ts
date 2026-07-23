import { requireCapability } from "@/server/auth/guards";
import { apiHandler, json } from "@/server/http/api-handler";
import { clientService } from "@/server/services/client.service";

/**
 * DELETE /api/crm/clients/:id/meetings/:meetingId — soft-delete a logged meeting (correction
 * only — meetings have no edit endpoint, matching legacy's genuine immutability). Gated `viewCrm`.
 */
export const DELETE = apiHandler<{ params: Promise<{ id: string; meetingId: string }> }>(
  async (_req, ctx) => {
    const user = await requireCapability("viewCrm");
    const { id, meetingId } = await ctx.params;
    await clientService.removeMeeting(id, meetingId, user);
    return json({ ok: true, id: meetingId });
  },
);
