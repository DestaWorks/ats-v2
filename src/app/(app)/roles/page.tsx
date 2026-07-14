import { redirect } from "next/navigation";
import { ROLE_PRIORITIES, ROLE_STATUSES, isRolePriority, isRoleStatus } from "@/lib/constants";
import { getCurrentUser } from "@/server/auth/guards";
import { clientRepository } from "@/server/repositories/client.repository";
import { openRoleService } from "@/server/services/open-role.service";
import { AddRoleButton } from "./add-role-modal";
import { RoleFilters } from "./role-filters";
import { RolesInventory } from "./roles-inventory";
import { TriageStrip } from "./triage-strip";

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
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");

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

  const [list, triage, clientRows] = await Promise.all([
    openRoleService.list({ clientId, status, priority, search, page }),
    openRoleService.triage(),
    clientRepository.list(),
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
