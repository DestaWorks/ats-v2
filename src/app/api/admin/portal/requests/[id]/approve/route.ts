import { approvePortalRequestSchema } from "@/lib/validation/portal";
import { requireCapability } from "@/server/auth/guards";
import { apiHandler, json } from "@/server/http/api-handler";
import { portalAccessRequestService } from "@/server/services/portal-access-request.service";

/**
 * POST /api/admin/portal/requests/:id/approve — links to an existing `ClientContact` or creates
 * one from the request's name/email, generates a portal link, flips status to approved. Gated
 * `configureClientPortal`.
 */
export const POST = apiHandler<{ params: Promise<{ id: string }> }>(async (req, ctx) => {
  const user = await requireCapability("configureClientPortal");
  const { id } = await ctx.params;
  const input = approvePortalRequestSchema.parse(await req.json());
  const result = await portalAccessRequestService.approve(id, input, user);
  return json(result);
});
