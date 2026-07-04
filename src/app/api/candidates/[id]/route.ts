import { hasCapability } from "@/lib/constants";
import { updateCandidateSchema } from "@/lib/validation/candidate";
import { requireUser } from "@/server/auth/guards";
import { apiHandler, json } from "@/server/http/api-handler";
import { AppError } from "@/server/http/app-error";
import { candidateService } from "@/server/services/candidate.service";
import { toCandidateDTO } from "@/server/services/candidate.dto";

/**
 * PATCH /api/candidates/:id — edit a candidate's PROFILE fields. Guarded by `requireUser()`
 * (working the pipeline is open to any signed-in user). `updateCandidateSchema.strict()` rejects
 * status / pipeline-timing / license-VERIFICATION keys (owned by `move` / `verify-license`) with a
 * 422 — pipeline movement never routes through here. `licenseNumber` (sensitive PII) is accepted
 * ONLY for a viewer with `viewCredentials`; otherwise 403 (defense-in-depth over the DTO gate).
 * Returns the PII-re-gated candidate DTO. 404 (missing/soft-deleted), 401, 403, 422 as usual.
 */
export const PATCH = apiHandler<{ params: Promise<{ id: string }> }>(async (req, ctx) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  const input = updateCandidateSchema.parse(await req.json());
  if (input.licenseNumber !== undefined && !hasCapability(user.role, "viewCredentials")) {
    throw new AppError("FORBIDDEN", "You don't have permission to edit the license number");
  }
  const updated = await candidateService.update(id, input, user);
  return json({ candidate: toCandidateDTO(updated, user) });
});
