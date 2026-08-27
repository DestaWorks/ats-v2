import { addProspectsFromSearchSchema } from "@destaworks/contracts/validation/prospect";
import { requireCapability } from "@destaworks/auth/guards";
import { apiHandler, json } from "@destaworks/integrations/http/api-handler";
import { prospectService } from "@destaworks/application/prospect.service";

/** Response body of `POST /api/prospects/bulk-add` — counts only. */
export type PostProspectBulkAddResponse = { added: number; skipped: number };

/**
 * POST /api/prospects/bulk-add — bulk-add selected NPPES search-result rows to the pipeline
 * (mirrors `POST /api/discover/add`). Re-derives the NPI dedupe set fresh server-side (defends
 * against a race since the search happened moments earlier client-side).
 */
export const POST = apiHandler(async (req: Request) => {
  const user = await requireCapability("viewClientDiscovery");
  const input = addProspectsFromSearchSchema.parse(await req.json());
  return json<PostProspectBulkAddResponse>(await prospectService.addFromSearch(input, user));
});
