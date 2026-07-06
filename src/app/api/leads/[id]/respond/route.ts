import { respondSchema } from "@/lib/validation/lead";
import { requireUser } from "@/server/auth/guards";
import { apiHandler, json } from "@/server/http/api-handler";
import { leadService } from "@/server/services/lead.service";

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
  return json({ lead });
});
