import type { ProspectDetailDTO } from "@/lib/validation/prospect";
import { requireCapability } from "@/server/auth/guards";
import { apiHandler, json } from "@/server/http/api-handler";
import { prospectService } from "@/server/services/prospect.service";

/** Response body of `POST /api/prospects/:id/enrich-hunter`. */
export type PostProspectEnrichHunterResponse = { prospect: ProspectDetailDTO };

/**
 * POST /api/prospects/:id/enrich-hunter — Hunter.io fallback when Apollo has no result. Needs
 * the prospect's website on file (400 if missing). Returns `FEATURE_DISABLED` (503) if
 * `HUNTER_API_KEY` isn't configured.
 */
export const POST = apiHandler<{ params: Promise<{ id: string }> }>(async (_req, ctx) => {
  const user = await requireCapability("viewClientDiscovery");
  const { id } = await ctx.params;
  const prospect = await prospectService.findContactsHunter(id, user);
  return json<PostProspectEnrichHunterResponse>({ prospect });
});
