import { discoverSearchQuerySchema } from "@destaworks/contracts/validation/discover";
import { getVerifiedUser } from "@destaworks/auth/guards";
import type {
  GetDiscoverSearchResponse,
  GetDiscoverCoverageGapsResponse,
} from "@destaworks/contracts/http/discover";
import type { LookupOptionsDTO } from "@destaworks/contracts/validation/lookups";
import { apiGet, query } from "@/lib/api/server";
import { readSearchParams, type RawSearchParams } from "@/lib/search-params";
import { DiscoverSearchForm } from "./discover-search-form";
import { DiscoverResultsTable } from "./discover-results-table";
import { CoverageGaps } from "./coverage-gaps";

/**
 * Discover (RSC, Wave 2.7) — the "find" step of the funnel: search NPPES, dedupe against existing
 * leads/candidates, add new providers straight to Sourcing. Guards with `getCurrentUser()` (open to
 * every operator, matches Sourcing/Pipeline). The search itself is an explicit-submit RSC read off
 * `searchParams` (no client-side fetch) — `GET /discover/search` calls NPPES + the dedupe
 * lookups server-side.
 */
export default async function DiscoverPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  await getVerifiedUser();

  const q = readSearchParams(await searchParams);

  const parsed = discoverSearchQuerySchema.safeParse({
    taxonomy: q.str("taxonomy") || undefined,
    state: q.str("state") || undefined,
    city: q.str("city") || undefined,
    firstName: q.str("firstName") || undefined,
    lastName: q.str("lastName") || undefined,
  });

  const [result, { clients }, coverageGaps] = await Promise.all([
    // The schema refines that at least one identifying field is present, so an unparsed query is
    // skipped here rather than sent to be refused with a 422.
    parsed.success
      ? apiGet<GetDiscoverSearchResponse>(`/discover/search${query({ ...parsed.data })}`)
      : Promise.resolve(null),
    apiGet<LookupOptionsDTO>("/lookups"),
    apiGet<GetDiscoverCoverageGapsResponse>("/discover/coverage-gaps"),
  ]);

  return (
    <div className="flex flex-col gap-5 px-8 py-6">
      <header>
        <h1 className="text-2xl font-bold text-navy">Discover</h1>
        <p className="text-sm text-gray">
          Search the NPPES provider registry to find new candidates to source.
        </p>
      </header>

      <CoverageGaps rows={coverageGaps} />

      <DiscoverSearchForm />

      {result ? (
        <>
          <p className="text-sm text-gray">
            {result.resultCount} match{result.resultCount === 1 ? "" : "es"}
            {result.resultCount > result.results.length
              ? ` (showing the first ${result.results.length})`
              : ""}
          </p>
          <DiscoverResultsTable results={result.results} clients={clients} />
        </>
      ) : (
        <p className="text-sm text-gray">
          Add a provider type, city, or name above, then search NPPES.
        </p>
      )}
    </div>
  );
}
