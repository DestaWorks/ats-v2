import { respondSchema, type LeadDetailDTO } from "@destaworks/contracts/validation/lead";
import { requireUser } from "@destaworks/auth/guards";
import { apiHandler, json } from "@destaworks/integrations/http/api-handler";
import { leadService } from "@destaworks/application/lead.service";

/** Response body of `POST /api/leads/:id/respond`. */
export type PostLeadRespondResponse = { lead: LeadDetailDTO };

/**
 * POST /api/leads/:id/respond — mark a lead Responded (Hot/Cold). Guarded by `requireUser()` (L-7).
 * `respondSchema` validates `kind` ∈ {"hot","cold"}. Returns the fresh lead detail. 200; 422 bad
 * kind; 409 CONFLICT (Promoted); 404 missing/soft-deleted; 401 unauth.
 */
export const POST = apiHandler<{ params: Promise<{ id: string }> }>(async (req, ctx) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  const { kind } = respondSchema.parse(await req.json());
  const lead = await leadService.respond(id, kind, user);
  return json<PostLeadRespondResponse>({ lead });
});
