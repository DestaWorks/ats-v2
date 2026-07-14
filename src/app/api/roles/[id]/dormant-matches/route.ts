import { requireUser } from "@/server/auth/guards";
import { apiHandler, json } from "@/server/http/api-handler";
import { openRoleService } from "@/server/services/open-role.service";

/**
 * GET /api/roles/:id/dormant-matches — fixed-weight re-engagement candidates for this role
 * (cold/no-response/future-collab leads only, top 10, legacy `scoreMatchDormant`).
 */
export const GET = apiHandler<{ params: Promise<{ id: string }> }>(async (_req, ctx) => {
  await requireUser();
  const { id } = await ctx.params;
  return json({ matches: await openRoleService.dormantMatches(id) });
});
