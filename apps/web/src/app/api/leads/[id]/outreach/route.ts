import { logOutreachSchema, type LeadEnvelope } from "@destaworks/contracts/validation/lead";
import { requireUser } from "@destaworks/auth/guards";
import { apiHandler, json } from "@destaworks/integrations/http/api-handler";
import { leadService } from "@destaworks/application/lead.service";

/** Response body of `POST /api/leads/:id/outreach`. */
export type PostLeadOutreachResponse = LeadEnvelope;

/**
 * POST /api/leads/:id/outreach — log an outreach attempt (advances the lead through the outreach
 * stages, server-authoritative). Guarded by `requireUser()` (L-7). `logOutreachSchema` validates the
 * `channel` (∈ OUTREACH_CHANNELS) + optional `note`/`at`. Returns the fresh lead detail. 200 advance;
 * 422 bad channel; 409 CONFLICT (Promoted); 404 missing/soft-deleted; 401 unauth.
 */
export const POST = apiHandler<{ params: Promise<{ id: string }> }>(async (req, ctx) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  const input = logOutreachSchema.parse(await req.json());
  const lead = await leadService.logOutreach(id, input, user);
  return json<PostLeadOutreachResponse>({ lead });
});
