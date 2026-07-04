import { hasCapability } from "@/lib/constants";
import { verifyLicenseSchema } from "@/lib/validation/candidate";
import { requireUser } from "@/server/auth/guards";
import { apiHandler, json } from "@/server/http/api-handler";
import { AppError } from "@/server/http/app-error";
import { candidateService } from "@/server/services/candidate.service";
import { toCandidateDTO } from "@/server/services/candidate.dto";

/**
 * POST /api/candidates/:id/verify-license — record a license verification. OPEN TO OPERATORS
 * (`requireUser`): license status drives the stage gates (INITIAL_SCREENING needs verified,
 * SUBMITTED needs `Active`), so Screeners/Associates (who hold no capabilities) must be able to
 * unblock the pipeline (design D-6). Writing `licenseNumber` in the same call still requires
 * `viewCredentials` (403 otherwise). The service stamps who/when and audits in one transaction.
 * Returns the PII-re-gated candidate DTO. 404 / 401 / 403 / 422 as usual.
 */
export const POST = apiHandler<{ params: Promise<{ id: string }> }>(async (req, ctx) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  const input = verifyLicenseSchema.parse(await req.json());
  if (input.licenseNumber !== undefined && !hasCapability(user.role, "viewCredentials")) {
    throw new AppError("FORBIDDEN", "You don't have permission to edit the license number");
  }
  const updated = await candidateService.verifyLicense(id, input, user);
  return json({ candidate: toCandidateDTO(updated, user) });
});
