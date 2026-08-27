import { requireCapability } from "@/server/auth/guards";
import { apiHandler, json } from "@/server/http/api-handler";
import { clientPortalService } from "@/server/services/client-portal.service";

/** Wire shape of `POST /api/crm/clients/:id/portal/tokens/:tokenId/revoke`. */
export type PostCrmPortalTokenRevokeResponse = { ok: true; id: string };

/**
 * POST /api/crm/clients/:id/portal/tokens/:tokenId/revoke — immediately invalidates a portal
 * link (checked on every request, not just cookie expiry). Gated `configureClientPortal`.
 */
export const POST = apiHandler<{ params: Promise<{ id: string; tokenId: string }> }>(
  async (_req, ctx) => {
    const user = await requireCapability("configureClientPortal");
    const { id, tokenId } = await ctx.params;
    await clientPortalService.revokeLink(id, tokenId, user);
    return json<PostCrmPortalTokenRevokeResponse>({ ok: true, id: tokenId });
  },
);
