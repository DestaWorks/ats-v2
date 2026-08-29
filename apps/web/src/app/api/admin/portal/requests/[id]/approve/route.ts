import {
  approvePortalRequestSchema,
  type GeneratedPortalLinkDTO,
} from "@destaworks/contracts/validation/portal";
import { requireCapability } from "@destaworks/auth/guards";
import { apiHandler, json } from "@destaworks/integrations/http/api-handler";
import { portalAccessRequestService } from "@destaworks/application/portal-access-request.service";

/** Response body of `POST /api/admin/portal/requests/:id/approve` — the generated portal link. */
export type PostAdminPortalRequestApproveResponse = GeneratedPortalLinkDTO;

/**
 * POST /api/admin/portal/requests/:id/approve — links to an existing `ClientContact` or creates
 * one from the request's name/email, generates a portal link, flips status to approved. Gated
 * `configureClientPortal`.
 */
export const POST = apiHandler<{ params: Promise<{ id: string }> }>(async (req, ctx) => {
  const user = await requireCapability("configureClientPortal");
  const { id } = await ctx.params;
  const input = approvePortalRequestSchema.parse(await req.json());
  const result = await portalAccessRequestService.approve(user, id, input);
  return json<PostAdminPortalRequestApproveResponse>(result);
});
