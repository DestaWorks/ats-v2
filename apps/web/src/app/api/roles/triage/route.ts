import type { GetRoleTriageResponse as RoleTriageContract } from "@destaworks/contracts/validation/open-role";
import { requireUser } from "@destaworks/auth/guards";
import { apiHandler, json } from "@destaworks/integrations/http/api-handler";
import { openRoleService } from "@destaworks/application/open-role.service";

/** Response body of `GET /api/roles/triage`. */
export type GetRoleTriageResponse = RoleTriageContract;

/**
 * GET /api/roles/triage — the top 3 "roles to work now" across every active (non-Filled/Closed)
 * role, ranked by priority + staleness + match quality (legacy triage-strip formula).
 */
export const GET = apiHandler(async () => {
  const user = await requireUser();
  return json<GetRoleTriageResponse>({ roles: await openRoleService.triage(user) });
});
