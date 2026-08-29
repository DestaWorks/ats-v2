import { hasCapability, isProspectStatus } from "@destaworks/domain/constants";
import { getVerifiedUser } from "@destaworks/auth/guards";
import type { GetProspectListResponse } from "@destaworks/contracts/validation/prospect";
import type { LookupOptionsDTO } from "@destaworks/contracts/validation/lookups";
import { ErrorState } from "@destaworks/ui/error-state";
import { apiGet, query } from "@/lib/api/server";
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
  searchParams: Promise<Record<string, string | string[] | undefined>>;
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

  const sp = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

  const rawStatus = one(sp.status);
  const status = rawStatus && isProspectStatus(rawStatus) ? rawStatus : undefined;
  const ownerId = one(sp.ownerId)?.trim() || undefined;
  const search = one(sp.search)?.trim() || undefined;
  const showDeleted = one(sp.deleted) === "1";
  const rawPage = Number(one(sp.page));
  const page = Number.isInteger(rawPage) && rawPage > 0 ? rawPage : 1;

  const [list, { users: owners }] = await Promise.all([
    apiGet<GetProspectListResponse>(
      `/prospects/list${query({ status, ownerId, search, deleted: showDeleted, page })}`,
    ),
    apiGet<LookupOptionsDTO>("/lookups"),
  ]);

  const listKey = [status, ownerId, search, showDeleted, page].join("|");

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
