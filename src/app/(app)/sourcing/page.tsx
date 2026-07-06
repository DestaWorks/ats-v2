import { redirect } from "next/navigation";
import { isLeadStatus, type LeadStatus } from "@/lib/constants";
import { getCurrentUser } from "@/server/auth/guards";
import { leadService } from "@/server/services/lead.service";
import { clientRepository } from "@/server/repositories/client.repository";
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
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");

  const sp = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

  const rawStatus = one(sp.status);
  const status: LeadStatus | undefined =
    rawStatus && isLeadStatus(rawStatus) ? rawStatus : undefined;
  const source = one(sp.source)?.trim() || undefined;
  const search = one(sp.search)?.trim() || undefined;

  const [list, clientRows] = await Promise.all([
    leadService.list({ status, source, search }),
    clientRepository.list(),
  ]);
  const clients = clientRows.map((c) => ({ id: c.id, name: c.name }));

  // Remount the client list whenever a SERVER filter changes so it re-seeds from page 1.
  const listKey = [status, source, search].join("|");

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

      <LeadFilters />

      <LeadsInventory key={listKey} initial={list} clients={clients} />
    </div>
  );
}
