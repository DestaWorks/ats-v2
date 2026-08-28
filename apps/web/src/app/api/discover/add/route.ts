import { discoverAddToSourcingSchema } from "@destaworks/contracts/validation/discover";
import type * as Contract from "@destaworks/contracts/http/discover";
import { requireUser } from "@destaworks/auth/guards";
import { apiHandler, json } from "@destaworks/integrations/http/api-handler";
import { discoverService } from "@destaworks/application/discover.service";

/** Wire shape of `POST /api/discover/add`. */
export type PostDiscoverAddResponse = Contract.PostDiscoverAddResponse;

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
  return json<PostDiscoverAddResponse>(await discoverService.addToSourcing(input, user));
});
