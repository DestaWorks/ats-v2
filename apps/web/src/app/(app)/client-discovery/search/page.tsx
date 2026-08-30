import { hasCapability } from "@destaworks/domain/constants";
import { searchProspectsSchema } from "@destaworks/contracts/validation/prospect";
import { getVerifiedUser } from "@destaworks/auth/guards";
import type { GetProspectSearchResponse } from "@destaworks/contracts/validation/prospect";
import type { GetSavedIcpsResponse } from "@destaworks/contracts/http/saved-icp";
import { ErrorState } from "@destaworks/ui/error-state";
import { apiGet, query } from "@/lib/api/server";
import { readSearchParams, type RawSearchParams } from "@/lib/search-params";
import { SearchForm } from "./search-form";
import { SearchResultsTable } from "./search-results-table";
import { SavedIcpBar } from "./saved-icp-bar";

/**
 * Client Discovery — NPPES search (RSC, mirrors `/discover/page.tsx` exactly): the search is an
 * explicit-submit RSC read off `searchParams` (no client-side fetch) — `GET /prospects/search`
 * calls NPPES server-side and flags the NPIs already tracked. Gated `viewClientDiscovery`, same as
 * the pipeline page; the API gates it again, and the check here is what renders the friendly
 * refusal instead of the error boundary.
 */
export default async function ClientDiscoverySearchPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const user = await getVerifiedUser();

  if (!hasCapability(user.role, "viewClientDiscovery")) {
    return (
      <div className="mx-auto flex max-w-4xl flex-col gap-6 p-6 sm:p-8">
        <ErrorState
          title="You don't have access"
          message="Client Discovery is limited to leadership roles. Ask an Owner, Director, Manager, or Admin for access."
        />
      </div>
    );
  }

  const q = readSearchParams(await searchParams);

  const parsed = searchProspectsSchema.safeParse({
    taxonomy: q.str("taxonomy") || undefined,
    state: q.str("state") || undefined,
    city: q.str("city") || undefined,
    zip: q.str("zip") || undefined,
  });

  const [result, { savedIcps }] = await Promise.all([
    // The schema refines that at least one criterion is present, so an unparsed query is skipped
    // here rather than sent to be refused with a 422.
    parsed.success
      ? apiGet<GetProspectSearchResponse>(`/prospects/search${query({ ...parsed.data })}`)
      : Promise.resolve(null),
    apiGet<GetSavedIcpsResponse>("/saved-icps"),
  ]);

  return (
    <div className="flex flex-col gap-5 px-8 py-6">
      <header>
        <h1 className="text-2xl font-bold text-navy">Search NPPES</h1>
        <p className="text-sm text-gray">
          Find practices by specialty, state, city, or zip — add new prospects to the pipeline.
        </p>
      </header>

      <SavedIcpBar savedIcps={savedIcps} currentFilters={parsed.success ? parsed.data : null} />

      <SearchForm />

      {result ? (
        <>
          <p className="text-sm text-gray">
            {result.resultCount} match{result.resultCount === 1 ? "" : "es"}
            {result.resultCount > result.results.length
              ? ` (showing the first ${result.results.length})`
              : ""}
          </p>
          <SearchResultsTable results={result.results} />
        </>
      ) : (
        <p className="text-sm text-gray">
          Add a specialty, state, city, or zip above, then search.
        </p>
      )}
    </div>
  );
}
