import { requireUser } from "@/server/auth/guards";
import { apiHandler, json } from "@/server/http/api-handler";
import { openRoleService } from "@/server/services/open-role.service";

/**
 * GET /api/roles/:id/matches — the active matcher's ranked leads for this role (client-tunable
 * weights, top 15, legacy `matchesFor`). 404 if the role is missing.
 */
export const GET = apiHandler<{ params: Promise<{ id: string }> }>(async (_req, ctx) => {
  await requireUser();
  const { id } = await ctx.params;
  return json({ matches: await openRoleService.matches(id) });
});
