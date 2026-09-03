import { isLeadStatus, type LeadStatus } from "@destaworks/domain/constants";
import { requirePageUser } from "@/lib/page-user";
import type { LookupOptionsDTO } from "@destaworks/contracts/validation/lookups";
import type { LeadListDTO } from "@destaworks/contracts/validation/lead";
import { apiGet, query } from "@/lib/api/server";
import { filterKey, readSearchParams, type RawSearchParams } from "@/lib/search-params";
import { LeadFilters } from "./lead-filters";
import { LeadsInventory } from "./leads-inventory";

/**
 * Sourcing inventory (RSC, Wave 2.6) — the pre-pipeline source-lead board (Sourced → Outreach →
 * Responded → Promoted). Guards with `getCurrentUser()` (the `(app)` layout guards too — defence in
 * depth; sourcing is open to every operator, L-7), SSR-renders page 1 of the filtered list directly
 * via `leadService.list(filters)` (no fetch flash), and loads the client options for the add-lead
 * target-client select. Filters are seeded from URL `searchParams` so a shared link lands
 * pre-filtered; the client `<LeadsInventory>` accumulates further keyset pages (Load more) and is
 * REMOUNTED (keyed on the filter signature) whenever a server filter changes, re-seeding page 1.
 */
export default async function SourcingPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  await requirePageUser();
  const q = readSearchParams(await searchParams);

  const status: LeadStatus | undefined = q.guarded("status", isLeadStatus);
  const source = q.text("source");
  const clientId = q.text("clientId");
  const ownerId = q.text("ownerId");
  const search = q.text("search");
  const showDeleted = q.flag("deleted");
  const page = q.page();

  const [list, { clients, users }] = await Promise.all([
    apiGet<LeadListDTO>(
      `/leads/list${query({ status, source, clientId, ownerId, search, includeDeleted: showDeleted, page })}`,
    ),
    // filter + bulk "Assign owner…" options (id + display name only)
    apiGet<LookupOptionsDTO>("/lookups"),
  ]);

  // Remount the client list whenever the SERVER query changes so it re-seeds cleanly.
  const listKey = filterKey(status, source, clientId, ownerId, search, showDeleted, page);

  return (
    <div className="flex flex-col gap-5 px-8 py-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-navy">Sourcing</h1>
          <p className="text-sm text-gray">
            {list.total} {list.total === 1 ? "lead" : "leads"} — source, chase, and promote into the
            pipeline.
          </p>
        </div>
      </header>

      <LeadFilters clients={clients} owners={users} />

      <LeadsInventory key={listKey} initial={list} clients={clients} users={users} />
    </div>
  );
}
