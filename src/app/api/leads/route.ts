import { addLeadSchema } from "@/lib/validation/lead";
import { requireUser } from "@/server/auth/guards";
import { apiHandler, json } from "@/server/http/api-handler";
import { leadService } from "@/server/services/lead.service";

/**
 * POST /api/leads — add a source lead (Wave 2.6). Guarded by `requireUser()` (sourcing is open to
 * any signed-in operator, L-7). `addLeadSchema.strict()` rejects any unknown/forbidden key (no
 * `status` — a create always starts at "Sourced"; the service forces it). Returns the created
 * lead's detail DTO with a 201. 401 / 422 as usual.
 */
export const POST = apiHandler(async (req: Request) => {
  const user = await requireUser();
  const input = addLeadSchema.parse(await req.json());
  const lead = await leadService.create(input, user);
  return json({ lead }, 201);
});
