import { requireCapability } from "@destaworks/auth/guards";
import { apiHandler, json } from "@destaworks/integrations/http/api-handler";
import { accessRequestService } from "@destaworks/application/access-request.service";
import type { AcknowledgedIdDTO } from "@destaworks/contracts/api";

/** Response body of `POST /api/admin/access-requests/:id/decline` — the id that was declined. */
export type PostAdminAccessRequestDeclineResponse = AcknowledgedIdDTO;

/** POST /api/admin/access-requests/:id/decline — mark a request declined. Gated `manageAccessRequests`. */
export const POST = apiHandler<{ params: Promise<{ id: string }> }>(async (_req, ctx) => {
  await requireCapability("manageAccessRequests");
  const { id } = await ctx.params;
  await accessRequestService.decline(id);
  return json<PostAdminAccessRequestDeclineResponse>({ ok: true, id });
});
