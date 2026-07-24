import { requireCapability } from "@/server/auth/guards";
import { apiHandler, json } from "@/server/http/api-handler";
import { portalAccessRequestService } from "@/server/services/portal-access-request.service";

/** POST /api/admin/portal/requests/:id/decline — mark a portal-access request declined. Gated `configureClientPortal`. */
export const POST = apiHandler<{ params: Promise<{ id: string }> }>(async (_req, ctx) => {
  await requireCapability("configureClientPortal");
  const { id } = await ctx.params;
  await portalAccessRequestService.decline(id);
  return json({ ok: true, id });
});
