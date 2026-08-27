import type { AdminPortalContactDTO } from "@/lib/validation/portal";
import { requireCapability } from "@/server/auth/guards";
import { apiHandler, json } from "@/server/http/api-handler";
import { clientPortalService } from "@/server/services/client-portal.service";

/** Wire shape of `GET /api/crm/clients/:id/portal/contacts`. */
export type GetCrmPortalContactsResponse = { contacts: AdminPortalContactDTO[] };

/**
 * GET /api/crm/clients/:id/portal/contacts — this client's contacts + their portal-link status,
 * for the CRM detail page's "Portal" tab. Gated `configureClientPortal` (Owner/Admin only —
 * stricter than the base `viewCrm` leadership gate, since this manages external PHI-exposing
 * credentials).
 */
export const GET = apiHandler<{ params: Promise<{ id: string }> }>(async (_req, ctx) => {
  await requireCapability("configureClientPortal");
  const { id } = await ctx.params;
  const contacts = await clientPortalService.listContactsForClient(id);
  return json<GetCrmPortalContactsResponse>({ contacts });
});
