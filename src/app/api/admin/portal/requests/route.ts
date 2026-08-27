import { requireCapability } from "@/server/auth/guards";
import { apiHandler, json } from "@/server/http/api-handler";
import { portalAccessRequestService } from "@/server/services/portal-access-request.service";
import type { PortalAccessRequestDTO } from "@/lib/validation/portal";

/** Response body of `GET /api/admin/portal/requests`. */
export type GetAdminPortalRequestsResponse = { requests: PortalAccessRequestDTO[] };

/** GET /api/admin/portal/requests — every submitted portal-access request. Gated `configureClientPortal`. */
export const GET = apiHandler(async () => {
  await requireCapability("configureClientPortal");
  return json<GetAdminPortalRequestsResponse>({
    requests: await portalAccessRequestService.list(),
  });
});
