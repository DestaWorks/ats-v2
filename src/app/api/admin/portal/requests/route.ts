import { requireCapability } from "@/server/auth/guards";
import { apiHandler, json } from "@/server/http/api-handler";
import { portalAccessRequestService } from "@/server/services/portal-access-request.service";

/** GET /api/admin/portal/requests — every submitted portal-access request. Gated `configureClientPortal`. */
export const GET = apiHandler(async () => {
  await requireCapability("configureClientPortal");
  return json({ requests: await portalAccessRequestService.list() });
});
