import { discoverAddToSourcingSchema } from "@/lib/validation/discover";
import { requireUser } from "@/server/auth/guards";
import { apiHandler, json } from "@/server/http/api-handler";
import { discoverService } from "@/server/services/discover.service";

/**
 * POST /api/discover/add — bulk-add the caller's selected NPPES search results to Sourcing
 * (Wave 2.7). Open to any signed-in operator (matches `POST /api/leads`/`POST /api/leads/import`
 * — no capability gate). `source` is always forced to `"NPPES"` server-side, never client-supplied.
 * Returns `{ added, skipped }`; rows already matching an existing lead (by NPI/name) or candidate
 * (by name) are silently skipped, not errored.
 */
export const POST = apiHandler(async (req) => {
  const user = await requireUser();
  const input = discoverAddToSourcingSchema.parse(await req.json());
  return json(await discoverService.addToSourcing(input, user));
});
