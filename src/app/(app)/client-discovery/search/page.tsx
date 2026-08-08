import { redirect } from "next/navigation";
import { hasCapability } from "@/lib/constants";
import { searchProspectsSchema } from "@/lib/validation/prospect";
import { getCurrentUser } from "@/server/auth/guards";
import { prospectService } from "@/server/services/prospect.service";
import { savedIcpService } from "@/server/services/saved-icp.service";
import { ErrorState } from "@/components/ui/error-state";
import { SearchForm } from "./search-form";
import { SearchResultsTable } from "./search-results-table";
import { SavedIcpBar } from "./saved-icp-bar";

/**
 * Client Discovery — NPPES search (RSC, mirrors `/discover/page.tsx` exactly): the search is an
 * explicit-submit RSC read off `searchParams` (no client-side fetch) — `prospectService.search()`
 * calls NPPES directly, server-side, same as `/client-discovery`'s list calls
 * `prospectService.list()`. Gated `viewClientDiscovery`, same as the pipeline page.
 */
export default async function ClientDiscoverySearchPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");

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

  const sp = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

  const parsed = searchProspectsSchema.safeParse({
    taxonomy: one(sp.taxonomy) || undefined,
    state: one(sp.state) || undefined,
    city: one(sp.city) || undefined,
    zip: one(sp.zip) || undefined,
  });

  const [result, savedIcps] = await Promise.all([
    parsed.success ? prospectService.search(parsed.data, user) : Promise.resolve(null),
    savedIcpService.list(user),
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
