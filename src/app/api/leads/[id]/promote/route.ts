import { requireUser } from "@/server/auth/guards";
import { apiHandler, json } from "@/server/http/api-handler";
import { leadService } from "@/server/services/lead.service";

/**
 * POST /api/leads/:id/promote — promote a lead into the candidate pipeline (creates a real Candidate
 * in Postgres, D2). Guarded by `requireUser()` (L-7); no body. Terminal + idempotent: an
 * already-Promoted lead → 409 CONFLICT (no double-promote), a missing/soft-deleted lead → 404.
 * Returns `{ candidateId }` (the client navigates to `/candidates/{candidateId}`). 200 / 409 / 404 / 401.
 */
export const POST = apiHandler<{ params: Promise<{ id: string }> }>(async (_req, ctx) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  const { candidateId } = await leadService.promote(id, user);
  return json({ candidateId });
});
