import { bulkProspectActionSchema } from "@destaworks/contracts/validation/prospect";
import type { BulkActionCounts } from "@destaworks/contracts/api";
import { requireCapability } from "@destaworks/auth/guards";
import { apiHandler, json } from "@destaworks/integrations/http/api-handler";
import { prospectService } from "@destaworks/application/prospect.service";

/** Response body of `POST /api/prospects/bulk` — counts only, never prospect PII. */
export type PostProspectBulkResponse = BulkActionCounts;

/**
 * POST /api/prospects/bulk — one dispatcher for the pipeline bulk toolbar: delete · restore ·
 * status · assign over <=200 ids (mirrors `POST /api/leads/bulk`). A converted ("Client")
 * prospect is SKIPPED server-side by status/assign; the response reports `{ affected, skipped }`.
 */
export const POST = apiHandler(async (req) => {
  const user = await requireCapability("viewClientDiscovery");
  const input = bulkProspectActionSchema.parse(await req.json());
  return json<PostProspectBulkResponse>(await prospectService.bulkAction(input, user));
});
