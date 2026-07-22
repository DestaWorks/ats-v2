import { hasCapability } from "@/lib/constants";
import { updateCandidateSchema } from "@/lib/validation/candidate";
import { requireUser } from "@/server/auth/guards";
import { apiHandler, json } from "@/server/http/api-handler";
import { AppError } from "@/server/http/app-error";
import { candidateService } from "@/server/services/candidate.service";
import { toCandidateDTO } from "@/server/services/candidate.dto";

/**
 * GET /api/candidates/:id — one candidate's PROFILE fields (Wave 4.1, Templates — the recipient
 * picker fetches this after a pick, since the list-search results don't carry email/phone/etc.).
 * Guarded by `requireUser()`. NOT the full detail composite (`getCandidateDetail`, used by the RSC
 * page) — deliberately lighter, no documents/notes/history/outreach.
 */
export const GET = apiHandler<{ params: Promise<{ id: string }> }>(async (_req, ctx) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  return json({ candidate: await candidateService.getProfile(id, user) });
});

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

/**
 * DELETE /api/candidates/:id — soft-delete a candidate (→ Trash). The canonical "delete this
 * candidate" action; reversible, so open to any operator (`requireUser` — the service self-gates
 * too). No body (id from params). The candidate disappears from every default view (board / list /
 * dashboard) at once (`deletedAt: null` filter) and can be restored from `/trash`. Returns
 * `{ ok, id }` — never candidate PII. 401 unauth; 404 missing / already-deleted (idempotent).
 */
export const DELETE = apiHandler<{ params: Promise<{ id: string }> }>(async (_req, ctx) => {
  await requireUser();
  const { id } = await ctx.params;
  await candidateService.softDelete(id);
  return json({ ok: true, id });
});
