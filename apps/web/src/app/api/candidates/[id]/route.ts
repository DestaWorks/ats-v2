import { hasCapability } from "@destaworks/domain/constants";
import { updateCandidateSchema } from "@destaworks/contracts/validation/candidate";
import { requireUser } from "@destaworks/auth/guards";
import { apiHandler, json } from "@destaworks/integrations/http/api-handler";
import { AppError } from "@destaworks/integrations/http/app-error";
import { candidateService } from "@destaworks/application/candidate.service";
import { toCandidateDTO, type CandidateDTO } from "@destaworks/application/candidate.dto";
import type { CandidateProfileDTO } from "@destaworks/contracts/validation/candidate";

/** Wire shape of `GET /api/candidates/:id` — the lighter profile projection (ISO date strings). */
export interface GetCandidateResponse {
  candidate: CandidateProfileDTO;
}

/** Wire shape of `PATCH /api/candidates/:id` — the PII-re-gated candidate after the edit. */
export interface PatchCandidateResponse {
  candidate: CandidateDTO;
}

/** Wire shape of `DELETE /api/candidates/:id` — a soft-delete ack; never candidate PII. */
export interface DeleteCandidateResponse {
  ok: true;
  id: string;
}

/**
 * GET /api/candidates/:id — one candidate's PROFILE fields (Wave 4.1, Templates — the recipient
 * picker fetches this after a pick, since the list-search results don't carry email/phone/etc.).
 * Guarded by `requireUser()`. NOT the full detail composite (`getCandidateDetail`, used by the RSC
 * page) — deliberately lighter, no documents/notes/history/outreach.
 */
export const GET = apiHandler<{ params: Promise<{ id: string }> }>(async (_req, ctx) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  return json<GetCandidateResponse>({ candidate: await candidateService.getProfile(id, user) });
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
  return json<PatchCandidateResponse>({ candidate: toCandidateDTO(updated, user) });
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
  return json<DeleteCandidateResponse>({ ok: true, id });
});
