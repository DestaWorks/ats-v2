import { coverageGapSupplyQuerySchema } from "@destaworks/contracts/validation/discover";
import type * as Contract from "@destaworks/contracts/http/discover";
import { requireUser } from "@destaworks/auth/guards";
import { apiHandler, json } from "@destaworks/integrations/http/api-handler";
import { discoverService } from "@destaworks/application/discover.service";

/** Wire shape of `GET /api/discover/coverage-gaps/supply`. */
export type GetDiscoverCoverageGapSupplyResponse = Contract.GetDiscoverCoverageGapSupplyResponse;

/**
 * GET /api/discover/coverage-gaps/supply — live NPPES supply for one (credential, state) combo
 * (Wave 5.5 backlog, legacy Drop 68 "Coverage Gaps"). The grouped role/pool/pipeline counts
 * themselves are read RSC-side (`discoverService.coverageGaps`, no self-fetch, matches Discover's
 * own search) — only this lazy, external-API-backed lookup needs a route. Rate-limited (external
 * NPPES call, mirrors `discoverService.search`/`similarityService.findSimilar`).
 */
export const GET = apiHandler(async (req: Request) => {
  const user = await requireUser();
  const parsed = coverageGapSupplyQuerySchema.parse(
    Object.fromEntries(new URL(req.url).searchParams),
  );
  return json<GetDiscoverCoverageGapSupplyResponse>(
    await discoverService.supplyForCombo(parsed, user),
  );
});
