import "server-only";
import { searchNppes } from "@/server/integrations/nppes";
import { classifyDiscoverRow } from "@/lib/rules/discover-dedupe";
import { scoreStateSimilarity } from "@/lib/rules/similarity";
import { taxonomyForCredential } from "@/lib/constants/nppes";
import type {
  FindSimilarInput,
  FindSimilarResultDTO,
  SimilarProviderDTO,
} from "@/lib/validation/similarity";
import type { AuthUser } from "@/server/auth/guards";
import { checkRateLimit } from "@/server/http/rate-limit";
import { AppError } from "@/server/http/app-error";
import { mapResult, buildDupSets, type MappedRow } from "./discover.service";

/** Display/operational cap on the returned, scored results — NPPES itself caps a call at 50. */
const RESULT_CAP = 20;

function toSimilarProviderDTO(row: MappedRow, similarityScore: number): SimilarProviderDTO {
  return {
    npi: row.npi,
    name: row.fullName,
    credential: row.credential,
    city: row.city,
    state: row.state,
    phone: row.phone,
    taxonomyDesc: row.taxonomyDesc,
    licenseNumber: row.licenseNumber,
    similarityScore,
  };
}

/**
 * "Find providers like this" (Wave 3.2, Smarter Sourcing) — net-new: results MUST come from
 * NPPES, not our own DB, since anyone already in our system isn't "new" to source. Searches
 * NPPES nationwide by the anchor's taxonomy (hard filter — wrong profession isn't "like this" at
 * all), excludes anyone already known (dedupe-classified as anything but "new"), then scores the
 * remaining net-new results by state closeness. Reuses Discover's own NPPES/dedupe internals
 * (`mapResult`/`buildDupSets`/`classifyDiscoverRow`) rather than duplicating them — this is a
 * genuinely different concern from Open-Roles matching (which compares a role to OUR OWN leads),
 * kept in its own service rather than folded into `discoverService` or `open-role.service.ts`.
 */
export const similarityService = {
  async findSimilar(input: FindSimilarInput, user: AuthUser): Promise<FindSimilarResultDTO> {
    const taxonomyOpt = taxonomyForCredential(input.credential ?? null);
    if (!taxonomyOpt) {
      throw new AppError("BAD_REQUEST", "No similarity search available for this credential yet");
    }

    checkRateLimit(`similarity-search:${user.id}`, { limit: 20, windowMs: 60_000 });

    const { results } = await searchNppes({ taxonomyDescription: taxonomyOpt.query });
    const mapped = results
      .map((r) => mapResult(r, taxonomyOpt.credential))
      // NPPES's own taxonomy_description match is loose (e.g. "Clinical" also surfaces
      // neurologists/geneticists) — require the EXACT target description, never trust the query
      // alone for precision.
      .filter((r) => r.taxonomyDesc === taxonomyOpt.matchDesc);

    const sets = await buildDupSets(
      mapped.map((m) => m.npi),
      mapped.map((m) => m.fullName),
    );

    const netNew = mapped.filter((m) => classifyDiscoverRow(m, sets).status === "new");

    const scored = netNew
      .map((m) => ({ row: m, score: scoreStateSimilarity(input.state ?? null, m.state) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, RESULT_CAP);

    return {
      taxonomyLabel: taxonomyOpt.label,
      results: scored.map(({ row, score }) => toSimilarProviderDTO(row, score)),
    };
  },
};
