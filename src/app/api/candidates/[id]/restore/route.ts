import { requireUser } from "@/server/auth/guards";
import { apiHandler, json } from "@/server/http/api-handler";
import { candidateService } from "@/server/services/candidate.service";
import { toCandidateDTO } from "@/server/services/candidate.dto";

/**
 * POST /api/candidates/:id/restore — restore a soft-deleted candidate from Trash back into its
 * existing stage. Reversible, so open to any operator (`requireUser`); the authenticated user is
 * forwarded to `candidateService.restore` (for the audit actor). No body. Returns the PII-re-gated
 * candidate DTO. 401 unauth; 404 missing; 409 (`CONFLICT`) if the candidate is not in Trash.
 */
export const POST = apiHandler<{ params: Promise<{ id: string }> }>(async (_req, ctx) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  const restored = await candidateService.restore(id, user);
  return json({ candidate: toCandidateDTO(restored, user) });
});
