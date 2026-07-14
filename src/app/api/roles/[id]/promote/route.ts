import { promoteFromMatchSchema } from "@/lib/validation/open-role";
import { requireUser } from "@/server/auth/guards";
import { apiHandler, json } from "@/server/http/api-handler";
import { openRoleService } from "@/server/services/open-role.service";

/**
 * POST /api/roles/:id/promote — fill this role from a matched lead: promotes the lead into the
 * candidate pipeline and stamps the new candidate's `filledFromRoleId`. Does NOT auto-flip the
 * role's status (legacy parity — mark it Filled separately via `PATCH /api/roles/:id`). Returns
 * the new candidate id. 404 missing role/lead; 409 lead already promoted.
 */
export const POST = apiHandler<{ params: Promise<{ id: string }> }>(async (req, ctx) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  const input = promoteFromMatchSchema.parse(await req.json());
  return json(await openRoleService.promote(id, input, user));
});
