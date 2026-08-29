import { hasCapability, isProspectStatus } from "@destaworks/domain/constants";
import { defined } from "@destaworks/domain/utils/defined";
import { getVerifiedUser } from "@destaworks/auth/guards";
import { prospectService } from "@destaworks/application/prospect.service";
import { ErrorState } from "@destaworks/ui/error-state";
import { ProspectsInventory } from "./prospects-inventory";
import { cachedUserList } from "@destaworks/integrations/http/request-cache";

/**
 * Client Discovery — B2B prospecting pipeline (RSC, new domain). Gated `viewClientDiscovery`
 * (leadership) — the `/api/prospects/**` routes enforce the same capability, so this is a
 * friendly no-access screen + the real gate, matching `crm/page.tsx`. SSR-renders page 1 of the
 * filtered list directly (no fetch flash); filters seed from URL `searchParams` so a shared link
 * lands pre-filtered. The `/client-discovery/search` sub-route owns the NPPES search (RSC-driven
 * off its own `searchParams`, matching `/discover`'s pattern) — kept separate so this page's list
 * read and that page's live external-API search never compete for the same render.
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

  const [list, userRows] = await Promise.all([
    prospectService.list(
      defined({ status, ownerId, search, includeDeleted: showDeleted, page }),
      user,
    ),
    cachedUserList(),
  ]);
  const owners = userRows.map((u) => ({ id: u.id, name: u.name }));

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
