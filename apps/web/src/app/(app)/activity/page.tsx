import {
  hasCapability,
  isAuditAction,
  isAuditEntity,
  type AuditAction,
  type AuditEntity,
} from "@destaworks/domain/constants";
import { EmptyState } from "@destaworks/ui/empty-state";
import { getVerifiedUser } from "@destaworks/auth/guards";
import type {
  ActivityListDTO,
  ActivityActorOptionsDTO,
} from "@destaworks/contracts/validation/activity";
import { apiGet, query } from "@/lib/api/server";
import { filterKey, readSearchParams, type RawSearchParams } from "@/lib/search-params";
import { ActivityFilters } from "./activity-filters";
import { ActivityLog } from "./activity-log";

/**
 * Activity Log (RSC, Wave 2.5) — the whole-log, filterable, admin-only audit surface (AL-6). Guards
 * with `getCurrentUser()` + `hasCapability(..,"viewAudit")`: a non-holder gets a clear in-app "no
 * access" state and the log is never rendered (the service ALSO self-gates — server authoritative).
 * A holder gets page 1 SSR-rendered (`GET /activity`)
 * plus the actor filter options, with the URL `searchParams` seeding the filters so a shared link
 * lands pre-filtered. The client `<ActivityLog>` accumulates further keyset pages (Load more) and owns
 * the per-row changes expander; it is remounted whenever a server filter changes (keyed on the filter
 * signature) so it always starts from page 1.
 */
export default async function ActivityPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const user = await getVerifiedUser();

  if (!hasCapability(user.role, "viewAudit")) {
    return (
      <div className="flex flex-col gap-6 px-8 py-6">
        <header>
          <h1 className="text-2xl font-bold text-navy">Activity log</h1>
        </header>
        <EmptyState
          title="Access restricted"
          description="Activity log is restricted to administrators."
        />
      </div>
    );
  }

  const q = readSearchParams(await searchParams);

  const action: AuditAction | undefined = q.guarded("action", isAuditAction);
  const entity: AuditEntity | undefined = q.guarded("entity", isAuditEntity);
  const actor = q.str("actor") || undefined;
  const from = q.date("from");
  const to = q.date("to");

  // `from`/`to` are `z.coerce.date()` on the wire, so they travel as ISO strings.
  const filters = {
    action,
    entity,
    actor,
    from: from?.toISOString(),
    to: to?.toISOString(),
  };

  const [list, { actors: actorOptions }] = await Promise.all([
    apiGet<ActivityListDTO>(`/activity${query(filters)}`),
    apiGet<ActivityActorOptionsDTO>("/activity/actor-options"),
  ]);

  // Remount the client log whenever a server filter changes so it re-seeds from page 1.
  const listKey = filterKey(action, entity, actor, q.str("from"), q.str("to"));

  return (
    <div className="flex flex-col gap-6 px-8 py-6">
      <header>
        <h1 className="text-2xl font-bold text-navy">Activity log</h1>
        <p className="text-sm text-gray">Who did what, across the system.</p>
      </header>

      <ActivityFilters actors={actorOptions} />

      <ActivityLog key={listKey} initial={list} />
    </div>
  );
}
