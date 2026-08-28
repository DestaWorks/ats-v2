import type { ProspectEnvelope } from "@destaworks/contracts/validation/prospect";
import { requireCapability } from "@destaworks/auth/guards";
import { apiHandler, json } from "@destaworks/integrations/http/api-handler";
import { prospectService } from "@destaworks/application/prospect.service";

/** Response body of `POST /api/prospects/:id/enrich`. */
export type PostProspectEnrichResponse = ProspectEnvelope;

/**
 * POST /api/prospects/:id/enrich — find contacts at this prospect via Apollo. Rate-limited inside
 * the service (real external-API cost). Returns `FEATURE_DISABLED` (503) if `APOLLO_API_KEY`
 * isn't configured — the client falls back to the Hunter.io / manual-add paths.
 */
export const POST = apiHandler<{ params: Promise<{ id: string }> }>(async (_req, ctx) => {
  const user = await requireCapability("viewClientDiscovery");
  const { id } = await ctx.params;
  const prospect = await prospectService.enrichContacts(id, user);
  return json<PostProspectEnrichResponse>({ prospect });
});
