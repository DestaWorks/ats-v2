import { bulkLeadActionSchema } from "@/lib/validation/lead";
import { requireUser } from "@/server/auth/guards";
import { apiHandler, json } from "@/server/http/api-handler";
import { leadService } from "@/server/services/lead.service";

/**
 * POST /api/leads/bulk — one dispatcher for the sourcing bulk toolbar
 * (`source_lead_bulk_action` / `source_lead_undelete` / `source_lead_bulk_log_outreach` parity):
 * delete · restore · status · assign · client · outreach over ≤200 ids. Ineligible rows
 * (Promoted for status/client/outreach; wrong delete-state) are SKIPPED server-side; the
 * response reports `{ affected, skipped }`. 404 unknown user/client reference; 422 bad body;
 * 401 unauth.
 */
export const POST = apiHandler(async (req) => {
  const user = await requireUser();
  const input = bulkLeadActionSchema.parse(await req.json());
  return json(await leadService.bulkAction(input, user));
});
