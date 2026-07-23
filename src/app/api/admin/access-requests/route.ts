import { requireCapability } from "@/server/auth/guards";
import { apiHandler, json } from "@/server/http/api-handler";
import { accessRequestService } from "@/server/services/access-request.service";

/** GET /api/admin/access-requests — every submitted request, newest first. Gated `manageAccessRequests`. */
export const GET = apiHandler(async () => {
  await requireCapability("manageAccessRequests");
  return json({ requests: await accessRequestService.list() });
});
