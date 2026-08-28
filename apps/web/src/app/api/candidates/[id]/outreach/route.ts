import { logOutreachSchema } from "@destaworks/contracts/validation/lead";
import { requireUser } from "@destaworks/auth/guards";
import { apiHandler, json } from "@destaworks/integrations/http/api-handler";
import { candidateService } from "@destaworks/application/candidate.service";
import type { OutreachAttemptEnvelope } from "@destaworks/contracts/validation/envelopes";

/** Wire shape of `POST /api/candidates/:id/outreach` — the freshly logged attempt. */
export type PostCandidateOutreachResponse = OutreachAttemptEnvelope;

/**
 * POST /api/candidates/:id/outreach — log one outreach attempt on a candidate
 * (`candidate_log_outreach` parity; the lead-side twin is `POST /api/leads/:id/outreach`). Guarded
 * by `requireUser()` (any operator chases candidates). `logOutreachSchema` (shared with leads)
 * validates `channel` ∈ OUTREACH_CHANNELS + optional `note`. Returns the fresh attempt DTO (201).
 * 404 missing/soft-deleted; 422 bad channel; 401 unauth.
 */
export const POST = apiHandler<{ params: Promise<{ id: string }> }>(async (req, ctx) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  const input = logOutreachSchema.parse(await req.json());
  const attempt = await candidateService.logOutreach(id, input, user);
  return json<PostCandidateOutreachResponse>({ attempt }, 201);
});
