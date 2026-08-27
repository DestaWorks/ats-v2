import { requireUser } from "@destaworks/auth/guards";
import { apiHandler, json } from "@destaworks/integrations/http/api-handler";
import { alertService } from "@destaworks/application/alert.service";
import type { AlertsDTO } from "@destaworks/contracts/validation/alerts";

/** Response body of `GET /api/alerts`. */
export type GetAlertsResponse = AlertsDTO;

/**
 * GET /api/alerts — the alerts-bell composite for the SESSION user: mentions + unread badge
 * count + the three derived buckets (overdue / new-to-review / verification-pending), all
 * viewer-scoped server-side. The bell polls this. 401 unauth.
 */
export const GET = apiHandler(async () => {
  const user = await requireUser();
  return json<GetAlertsResponse>(await alertService.forViewer(user));
});
