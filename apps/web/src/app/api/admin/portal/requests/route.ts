import { requireCapability } from "@destaworks/auth/guards";
import { apiHandler, json } from "@destaworks/integrations/http/api-handler";
import { portalAccessRequestService } from "@destaworks/application/portal-access-request.service";
import type { PortalAccessRequestDTO } from "@destaworks/contracts/validation/portal";

/** Response body of `GET /api/admin/portal/requests`. */
export type GetAdminPortalRequestsResponse = { requests: PortalAccessRequestDTO[] };

/** GET /api/admin/portal/requests — every submitted portal-access request. Gated `configureClientPortal`. */
export const GET = apiHandler(async () => {
  await requireCapability("configureClientPortal");
  return json<GetAdminPortalRequestsResponse>({
    requests: await portalAccessRequestService.list(),
  });
});
