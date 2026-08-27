import type { RoleMatchDTO } from "@destaworks/contracts/validation/open-role";
import { requireUser } from "@destaworks/auth/guards";
import { apiHandler, json } from "@destaworks/integrations/http/api-handler";
import { openRoleService } from "@destaworks/application/open-role.service";

/** Response body of `GET /api/roles/:id/matches`. */
export type GetRoleMatchesResponse = { matches: RoleMatchDTO[] };

/**
 * GET /api/roles/:id/matches — the active matcher's ranked leads for this role (client-tunable
 * weights, top 15, legacy `matchesFor`). 404 if the role is missing.
 */
export const GET = apiHandler<{ params: Promise<{ id: string }> }>(async (_req, ctx) => {
  await requireUser();
  const { id } = await ctx.params;
  return json<GetRoleMatchesResponse>({ matches: await openRoleService.matches(id) });
});
