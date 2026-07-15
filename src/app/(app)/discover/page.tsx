import { redirect } from "next/navigation";
import { discoverSearchQuerySchema } from "@/lib/validation/discover";
import { getCurrentUser } from "@/server/auth/guards";
import { discoverService } from "@/server/services/discover.service";
import { clientRepository } from "@/server/repositories/client.repository";
import { DiscoverSearchForm } from "./discover-search-form";
import { DiscoverResultsTable } from "./discover-results-table";

/**
 * Discover (RSC, Wave 2.7) — the "find" step of the funnel: search NPPES, dedupe against existing
 * leads/candidates, add new providers straight to Sourcing. Guards with `getCurrentUser()` (open to
 * every operator, matches Sourcing/Pipeline). The search itself is an explicit-submit RSC read off
 * `searchParams` (no client-side fetch) — `discoverService.search()` calls NPPES + the dedupe
 * lookups directly, server-side, same as `sourcing/page.tsx` calls `leadService.list()`.
 */
export default async function DiscoverPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");

  const sp = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

  const parsed = discoverSearchQuerySchema.safeParse({
    taxonomy: one(sp.taxonomy) || undefined,
    state: one(sp.state) || undefined,
    city: one(sp.city) || undefined,
    firstName: one(sp.firstName) || undefined,
    lastName: one(sp.lastName) || undefined,
  });

  const [result, clientRows] = await Promise.all([
    parsed.success ? discoverService.search(parsed.data, user) : Promise.resolve(null),
    clientRepository.list(),
  ]);
  const clients = clientRows.map((c) => ({ id: c.id, name: c.name }));

  return (
    <div className="flex flex-col gap-5 px-8 py-6">
      <header>
        <h1 className="text-2xl font-bold text-navy">Discover</h1>
        <p className="text-sm text-gray">
          Search the NPPES provider registry to find new candidates to source.
        </p>
      </header>

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
