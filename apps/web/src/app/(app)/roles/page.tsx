import {
  ROLE_PRIORITIES,
  ROLE_STATUSES,
  isRolePriority,
  isRoleStatus,
} from "@destaworks/domain/constants";
import { getVerifiedUser } from "@destaworks/auth/guards";
import { openRoleService } from "@destaworks/application/open-role.service";
import { AddRoleButton } from "./add-role-modal";
import { RoleFilters } from "./role-filters";
import { RolesInventory } from "./roles-inventory";
import { TriageStrip } from "./triage-strip";
import { cachedClientList } from "@destaworks/integrations/http/request-cache";

/**
 * Open Roles (RSC, Wave 3.5) — the client-requisition board. SSR-renders page 1 of the filtered
 * list + the triage strip directly (no fetch flash); the client `<RolesInventory>` handles
 * filters and pagination. `<AddRoleButton>` sits in the page HEADER next to the title (matches
 * `candidates/page.tsx` — NOT inside the table toolbar). Filters seed from URL `searchParams` so
 * a shared link lands pre-filtered.
 */
export default async function RolesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

  const rawStatus = one(sp.status);
  const status = rawStatus && isRoleStatus(rawStatus) ? rawStatus : undefined;
  const rawPriority = one(sp.priority);
  const priority = rawPriority && isRolePriority(rawPriority) ? rawPriority : undefined;
  const clientId = one(sp.clientId)?.trim() || undefined;
  const search = one(sp.search)?.trim() || undefined;
  const rawPage = Number(one(sp.page));
  const page = Number.isInteger(rawPage) && rawPage > 0 ? rawPage : 1;

  const user = await getVerifiedUser();
  const [list, triage, clientRows] = await Promise.all([
    openRoleService.list(
      {
        ...(clientId !== undefined && { clientId }),
        ...(status !== undefined && { status }),
        ...(priority !== undefined && { priority }),
        ...(search !== undefined && { search }),
        page,
      },
      user,
    ),
    openRoleService.triage(user),
    cachedClientList(),
  ]);
  const clients = clientRows.map((c) => ({ id: c.id, name: c.name }));
  const listKey = [clientId, status, priority, search, page].join("|");

  return (
    <div className="flex flex-col gap-5 px-8 py-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-navy">Open Roles</h1>
          <p className="text-sm text-gray">
            {list.total} {list.total === 1 ? "role" : "roles"} — client requisitions, matched leads,
            and what to work next.
          </p>
        </div>
        <AddRoleButton clients={clients} size="sm" variant="success" />
      </header>

      <TriageStrip roles={triage} />

      <RoleFilters clients={clients} statuses={ROLE_STATUSES} priorities={ROLE_PRIORITIES} />

      <RolesInventory key={listKey} initial={list} />
    </div>
  );
}
