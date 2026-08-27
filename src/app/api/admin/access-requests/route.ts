import { requireCapability } from "@/server/auth/guards";
import { apiHandler, json } from "@/server/http/api-handler";
import { accessRequestService } from "@/server/services/access-request.service";
import type { AccessRequestDTO } from "@/lib/validation/admin";

/** Response body of `GET /api/admin/access-requests`. */
export type GetAdminAccessRequestsResponse = { requests: AccessRequestDTO[] };

/** GET /api/admin/access-requests — every submitted request, newest first. Gated `manageAccessRequests`. */
export const GET = apiHandler(async () => {
  await requireCapability("manageAccessRequests");
  return json<GetAdminAccessRequestsResponse>({ requests: await accessRequestService.list() });
});
