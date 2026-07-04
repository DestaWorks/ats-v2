import { moveInputSchema } from "@/lib/validation/pipeline";
import { requireUser } from "@/server/auth/guards";
import { apiHandler, json } from "@/server/http/api-handler";
import { candidateService } from "@/server/services/candidate.service";

/**
 * POST /api/candidates/:id/move — a single server-authoritative move. Guarded by `requireUser()`;
 * the authenticated user is forwarded to `candidateService.move`, which runs the stage gate and
 * (atomically) updates the candidate + stage_history + audit. A blocked gate surfaces as
 * `AppError("STAGE_BLOCKED")` → 422 (reasons joined into the message) via `apiHandler`; an unknown
 * status → 400, a missing/soft-deleted candidate → 404.
 *
 * Returns ONLY the persisted pipeline fields — never candidate PII (email/phone/licenseNumber). The
 * board updates its card locally; this response just confirms the new stage the server recorded.
 */
export const POST = apiHandler<{ params: Promise<{ id: string }> }>(async (req, ctx) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  const { toStatus } = moveInputSchema.parse(await req.json());
  const updated = await candidateService.move(id, toStatus, user);
  return json({
    candidate: {
      id: updated.id,
      status: updated.status,
      stageOrder: updated.stageOrder,
      stageEnteredAt: updated.stageEnteredAt,
    },
  });
});
