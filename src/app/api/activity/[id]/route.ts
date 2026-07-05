import { requireCapability } from "@/server/auth/guards";
import { apiHandler, json } from "@/server/http/api-handler";
import { auditService } from "@/server/services/audit.service";

/**
 * GET /api/activity/:id — the Activity Log's ON-DEMAND detail (Wave 2.5). Returns the ONE row's
 * whole-entity `before`/`after` snapshots (AL-3); fetched only when a list row is expanded, so the
 * PII-bearing blobs stay off the always-rendered list.
 *
 * Guarded by `requireCapability("viewAudit")` at the route (defense-in-depth over the service's own
 * `viewAudit` gate). 401 unauth; 403 non-holder; 404 unknown/absent id.
 */
export const GET = apiHandler<{ params: Promise<{ id: string }> }>(async (_req, ctx) => {
  await requireCapability("viewAudit");
  const { id } = await ctx.params;
  const detail = await auditService.getActivityDetail(id);
  return json(detail);
});
