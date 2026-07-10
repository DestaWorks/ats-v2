import { requireUser } from "@/server/auth/guards";
import { apiHandler, json } from "@/server/http/api-handler";
import { alertService } from "@/server/services/alert.service";

/**
 * GET /api/alerts — the alerts-bell composite for the SESSION user: mentions + unread badge
 * count + the three derived buckets (overdue / new-to-review / verification-pending), all
 * viewer-scoped server-side. The bell polls this. 401 unauth.
 */
export const GET = apiHandler(async () => {
  const user = await requireUser();
  return json(await alertService.forViewer(user));
});
