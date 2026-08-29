import type { RoleMatchesEnvelope } from "@destaworks/contracts/validation/open-role";
import { requireUser } from "@destaworks/auth/guards";
import { apiHandler, json } from "@destaworks/integrations/http/api-handler";
import { openRoleService } from "@destaworks/application/open-role.service";

/** Response body of `GET /api/roles/:id/dormant-matches`. */
export type GetRoleDormantMatchesResponse = RoleMatchesEnvelope;

/**
 * GET /api/roles/:id/dormant-matches — fixed-weight re-engagement candidates for this role
 * (cold/no-response/future-collab leads only, top 10, legacy `scoreMatchDormant`).
 */
export const GET = apiHandler<{ params: Promise<{ id: string }> }>(async (_req, ctx) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  return json<GetRoleDormantMatchesResponse>({
    matches: await openRoleService.dormantMatches(id, user),
  });
});
