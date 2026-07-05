import { requireCapability } from "@/server/auth/guards";
import { apiHandler, json } from "@/server/http/api-handler";
import { candidateService } from "@/server/services/candidate.service";

/**
 * POST /api/candidates/:id/purge — PERMANENTLY delete a trashed candidate (cascades documents,
 * notes, stage history). Irreversible + destructive, so guarded by `requireCapability("purgeCandidate")`
 * (Owner / Admin only) BEFORE any work — a non-holder is rejected with 403. The service re-checks the
 * capability (server-authoritative) and enforces the two-step gate: a candidate must already be in
 * Trash (409 `CONFLICT` on a live one). No body. Returns only `{ ok, id }` — the record is gone, so
 * PII is never echoed. 401 unauth; 403 without the capability; 404 missing; 409 if not trashed.
 */
export const POST = apiHandler<{ params: Promise<{ id: string }> }>(async (_req, ctx) => {
  const user = await requireCapability("purgeCandidate");
  const { id } = await ctx.params;
  await candidateService.purge(id, user);
  return json({ ok: true, id });
});
