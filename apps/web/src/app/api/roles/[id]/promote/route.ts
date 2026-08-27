import { promoteFromMatchSchema } from "@destaworks/contracts/validation/open-role";
import { requireUser } from "@destaworks/auth/guards";
import { apiHandler, json } from "@destaworks/integrations/http/api-handler";
import { openRoleService } from "@destaworks/application/open-role.service";

/** Response body of `POST /api/roles/:id/promote` — the new candidate's id only. */
export type PostRolePromoteResponse = { candidateId: string };

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
  return json<PostRolePromoteResponse>(await openRoleService.promote(id, input, user));
});
