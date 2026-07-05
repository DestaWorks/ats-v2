import { redirect } from "next/navigation";
import {
  hasCapability,
  isAuditAction,
  isAuditEntity,
  type AuditAction,
  type AuditEntity,
} from "@/lib/constants";
import { EmptyState } from "@/components/ui/empty-state";
import { getCurrentUser } from "@/server/auth/guards";
import type { AuditListFilters } from "@/server/repositories/audit.repository";
import { auditService } from "@/server/services/audit.service";
import { ActivityFilters } from "./activity-filters";
import { ActivityLog } from "./activity-log";

/**
 * Activity Log (RSC, Wave 2.5) — the whole-log, filterable, admin-only audit surface (AL-6). Guards
 * with `getCurrentUser()` + `hasCapability(..,"viewAudit")`: a non-holder gets a clear in-app "no
 * access" state and the log is never rendered (the service ALSO self-gates — server authoritative).
 * A holder gets page 1 SSR-rendered (`auditService.listActivity` — no viewer arg, session-authoritative)
 * plus the actor filter options, with the URL `searchParams` seeding the filters so a shared link
 * lands pre-filtered. The client `<ActivityLog>` accumulates further keyset pages (Load more) and owns
 * the per-row changes expander; it is remounted whenever a server filter changes (keyed on the filter
 * signature) so it always starts from page 1.
 */
export default async function ActivityPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");

  if (!hasCapability(user.role, "viewAudit")) {
    return (
      <div className="mx-auto flex max-w-6xl flex-col gap-5 p-6">
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

  const sp = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

  const rawAction = one(sp.action);
  const action: AuditAction | undefined =
    rawAction && isAuditAction(rawAction) ? rawAction : undefined;
  const rawEntity = one(sp.entity);
  const entity: AuditEntity | undefined =
    rawEntity && isAuditEntity(rawEntity) ? rawEntity : undefined;
  const actor = one(sp.actor) || undefined;
  const from = parseDay(one(sp.from));
  const to = parseDay(one(sp.to));

  const filters: AuditListFilters = {
    ...(action ? { action } : {}),
    ...(entity ? { entity } : {}),
    ...(actor ? { actor } : {}),
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
  };

  const [list, actorOptions] = await Promise.all([
    auditService.listActivity(filters, null),
    auditService.listActorOptions(),
  ]);

  // Remount the client log whenever a server filter changes so it re-seeds from page 1.
  const listKey = [action, entity, actor, one(sp.from), one(sp.to)].join("|");

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5 p-6">
      <header>
        <h1 className="text-2xl font-bold text-navy">Activity log</h1>
        <p className="text-sm text-gray">Who did what, across the system.</p>
      </header>

      <ActivityFilters actors={actorOptions} />

      <ActivityLog key={listKey} initial={list} />
    </div>
  );
}

/** Parse a `YYYY-MM-DD` day param to a Date; invalid/absent → undefined (the service widens bounds). */
function parseDay(value: string | undefined): Date | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d;
}
