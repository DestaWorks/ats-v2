import { hasCapability, isProspectStatus } from "@destaworks/domain/constants";
import { requirePageUser } from "@/lib/page-user";
import type { GetProspectListResponse } from "@destaworks/contracts/validation/prospect";
import type { LookupOptionsDTO } from "@destaworks/contracts/validation/lookups";
import { ErrorState } from "@destaworks/ui/error-state";
import { apiGet, query } from "@/lib/api/server";
import { filterKey, readSearchParams, type RawSearchParams } from "@/lib/search-params";
import { ProspectsInventory } from "./prospects-inventory";

/**
 * Client Discovery — B2B prospecting pipeline (RSC, new domain). Gated `viewClientDiscovery`
 * (leadership) — the `/prospects/**` endpoints enforce the same capability, so this is a
 * friendly no-access screen + the real gate, matching `crm/page.tsx`. SSR-renders page 1 of the
 * filtered list through the API (no fetch flash); filters seed from URL `searchParams` so a
 * shared link lands pre-filtered. The `/client-discovery/search` sub-route owns the NPPES search
 * (RSC-driven off its own `searchParams`, matching `/discover`'s pattern) — kept separate so this
 * page's list read and that page's live external-API search never compete for the same render.
 */
export default async function ClientDiscoveryPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const user = await requirePageUser();

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

  const status = q.guarded("status", isProspectStatus);
  const ownerId = q.text("ownerId");
  const search = q.text("search");
  const showDeleted = q.flag("deleted");
  const page = q.page();

  const [list, { users: owners }] = await Promise.all([
    apiGet<GetProspectListResponse>(
      `/prospects/list${query({ status, ownerId, search, deleted: showDeleted, page })}`,
    ),
    apiGet<LookupOptionsDTO>("/lookups"),
  ]);

  const listKey = filterKey(status, ownerId, search, showDeleted, page);

  return (
    <div className="flex flex-col gap-5 px-8 py-6">
      <header>
        <h1 className="text-2xl font-bold text-navy">Client Discovery</h1>
        <p className="text-sm text-gray">
          {list.total} {list.total === 1 ? "prospect" : "prospects"} — practices found via NPPES or
          added manually, tracked toward becoming a client.
        </p>
      </header>

      <ProspectsInventory key={listKey} initial={list} owners={owners} />
    </div>
  );
}
