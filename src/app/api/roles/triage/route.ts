import { requireUser } from "@/server/auth/guards";
import { apiHandler, json } from "@/server/http/api-handler";
import { openRoleService } from "@/server/services/open-role.service";

/**
 * GET /api/roles/triage — the top 3 "roles to work now" across every active (non-Filled/Closed)
 * role, ranked by priority + staleness + match quality (legacy triage-strip formula).
 */
export const GET = apiHandler(async () => {
  await requireUser();
  return json({ roles: await openRoleService.triage() });
});
