import { requireCapability } from "@destaworks/auth/guards";
import { apiHandler, json } from "@destaworks/integrations/http/api-handler";
import { accessRequestService } from "@destaworks/application/access-request.service";
import type { AccessRequestDTO } from "@destaworks/contracts/validation/admin";

/** Response body of `GET /api/admin/access-requests`. */
export type GetAdminAccessRequestsResponse = { requests: AccessRequestDTO[] };

/** GET /api/admin/access-requests — every submitted request, newest first. Gated `manageAccessRequests`. */
export const GET = apiHandler(async () => {
  await requireCapability("manageAccessRequests");
  return json<GetAdminAccessRequestsResponse>({ requests: await accessRequestService.list() });
});
