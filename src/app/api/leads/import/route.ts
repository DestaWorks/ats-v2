import { importLeadsSchema } from "@/lib/validation/lead";
import { requireUser } from "@/server/auth/guards";
import { apiHandler, json } from "@/server/http/api-handler";
import { leadService } from "@/server/services/lead.service";

/**
 * POST /api/leads/import — one ≤200-row chunk of the lead CSV import
 * (`source_lead_bulk_import` parity; the client chunks sequentially, legacy-style). Open to any
 * operator (the legacy sourcing module had no role gate — sourcers import their own lists).
 * Dedup is server-side (lowercased email, else case-insensitive name). Returns
 * `{ added, skipped }` per chunk. 422 bad rows; 401 unauth.
 */
export const POST = apiHandler(async (req) => {
  const user = await requireUser();
  const input = importLeadsSchema.parse(await req.json());
  return json(await leadService.importLeads(input, user));
});
