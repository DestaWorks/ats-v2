import { bulkProspectActionSchema } from "@/lib/validation/prospect";
import { requireCapability } from "@/server/auth/guards";
import { apiHandler, json } from "@/server/http/api-handler";
import { prospectService } from "@/server/services/prospect.service";

/** Response body of `POST /api/prospects/bulk` — counts only, never prospect PII. */
export type PostProspectBulkResponse = { affected: number; skipped: number };

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
