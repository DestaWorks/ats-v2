import { requireCapability } from "@destaworks/auth/guards";
import { apiHandler, json } from "@destaworks/integrations/http/api-handler";
import { portalAccessRequestService } from "@destaworks/application/portal-access-request.service";

/** Response body of `POST /api/admin/portal/requests/:id/decline` — the id that was declined. */
export type PostAdminPortalRequestDeclineResponse = { ok: true; id: string };

/** POST /api/admin/portal/requests/:id/decline — mark a portal-access request declined. Gated `configureClientPortal`. */
export const POST = apiHandler<{ params: Promise<{ id: string }> }>(async (_req, ctx) => {
  await requireCapability("configureClientPortal");
  const { id } = await ctx.params;
  await portalAccessRequestService.decline(id);
  return json<PostAdminPortalRequestDeclineResponse>({ ok: true, id });
});
