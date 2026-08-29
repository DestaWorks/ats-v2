import { requireCapability } from "@destaworks/auth/guards";
import { apiHandler, json } from "@destaworks/integrations/http/api-handler";
import { portalAccessRequestService } from "@destaworks/application/portal-access-request.service";
import type { AcknowledgedIdDTO } from "@destaworks/contracts/api";

/** Response body of `POST /api/admin/portal/requests/:id/decline` — the id that was declined. */
export type PostAdminPortalRequestDeclineResponse = AcknowledgedIdDTO;

/** POST /api/admin/portal/requests/:id/decline — mark a portal-access request declined. Gated `configureClientPortal`. */
export const POST = apiHandler<{ params: Promise<{ id: string }> }>(async (_req, ctx) => {
  const actor = await requireCapability("configureClientPortal");
  const { id } = await ctx.params;
  await portalAccessRequestService.decline(actor, id);
  return json<PostAdminPortalRequestDeclineResponse>({ ok: true, id });
});
