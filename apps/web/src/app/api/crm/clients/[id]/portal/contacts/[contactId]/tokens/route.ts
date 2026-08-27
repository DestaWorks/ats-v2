import type { GeneratedPortalLinkDTO } from "@destaworks/contracts/validation/portal";
import { requireCapability } from "@destaworks/auth/guards";
import { apiHandler, json } from "@destaworks/integrations/http/api-handler";
import { clientPortalService } from "@destaworks/application/client-portal.service";

/** Wire shape of `POST /api/crm/clients/:id/portal/contacts/:contactId/tokens`. */
export type PostCrmPortalTokenResponse = GeneratedPortalLinkDTO;

/**
 * POST /api/crm/clients/:id/portal/contacts/:contactId/tokens — generate a portal link for this
 * contact (revokes any prior active link first — one live link per contact at a time). Returns
 * the plaintext token ONCE. Gated `configureClientPortal`.
 */
export const POST = apiHandler<{ params: Promise<{ id: string; contactId: string }> }>(
  async (_req, ctx) => {
    const user = await requireCapability("configureClientPortal");
    const { id, contactId } = await ctx.params;
    const result = await clientPortalService.generateLink(id, contactId, user);
    return json<PostCrmPortalTokenResponse>(result, 201);
  },
);
