import "server-only";
import { requireCapability } from "@/server/auth/guards";
import { auditRepository, type AuditListFilters } from "@/server/repositories/audit.repository";
import { candidateRepository } from "@/server/repositories/candidate.repository";
import { userRepository } from "@/server/repositories/user.repository";
import { AppError } from "@/server/http/app-error";
import { encodeCursor, type PageCursor } from "@/lib/validation/cursor";
import type {
  ActivityActorOption,
  ActivityDetailDTO,
  ActivityItemDTO,
  ActivityListDTO,
} from "@/lib/validation/activity";

/**
 * Audit-trail read logic. Services orchestrate repositories and own authz; they never
 * import Prisma directly.
 *
 * The capability gate is load-bearing: `activity_log` rows carry `before`/`after` snapshots
 * that may contain PII/PHI, so reads are restricted to `viewAudit` (admin-only) — the
 * conservative compliance default (HIPAA / Ethiopian DPP). Widen later if the product needs
 * leadership to read the trail.
 *
 * Wave 2.5 adds the whole-log Activity Log (`listActivity`/`getActivityDetail`/`listActorOptions`)
 * — a global, filterable, keyset-paginated read. The LIST deliberately drops the raw `before`/
 * `after` snapshots (AL-3): rows carry only `hasChanges`, and the heavy snapshots load on demand
 * via `getActivityDetail`. Date-range filters are interpreted as UTC day-bounds here.
 */

/** One keyset page of the Activity Log (matches the candidate list's `LIST_PAGE`). */
const ACTIVITY_PAGE = 50;

/** Widen a date to the START of its UTC day (inclusive `from` bound). */
function utcDayStart(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0));
}

/** Widen a date to the END of its UTC day (inclusive `to` bound, so "to = today" includes today). */
function utcDayEnd(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 23, 59, 59, 999));
}

/** The list row shape the repo returns (before/after selected only to derive `hasChanges`). */
interface AuditListRow {
  id: string;
  at: Date;
  actor: string;
  action: string;
  entity: string;
  entityId: string;
  before: unknown;
  after: unknown;
}

/**
 * Map a raw audit row → the list DTO. DROPS `before`/`after` (they are only read to compute
 * `hasChanges`) so the PII-bearing snapshots never reach the client on the list path (AL-3).
 * Resolves the actor name and, for `entity=candidate` rows, the candidate label + linkability.
 */
function toActivityItem(
  row: AuditListRow,
  actorNames: Map<string, string>,
  candidates: Map<string, { id: string; name: string; deletedAt: Date | null }>,
): ActivityItemDTO {
  let entityLabel: string | null = null;
  let entityLink: string | null = null;
  if (row.entity === "candidate") {
    const c = candidates.get(row.entityId);
    if (c) {
      entityLabel = c.name;
      // Link ONLY to a live candidate; a soft-deleted (or purged/absent) one shows a name/id, no link.
      entityLink = c.deletedAt ? null : `/candidates/${c.id}`;
    }
  }
  return {
    id: row.id,
    at: row.at.toISOString(),
    actorId: row.actor,
    actorName: actorNames.get(row.actor) ?? "Unknown",
    action: row.action,
    entity: row.entity,
    entityId: row.entityId,
    entityLabel,
    entityLink,
    hasChanges: Boolean(row.before) || Boolean(row.after),
  };
}

export const auditService = {
  async listAuditForEntity(entity: string, entityId: string) {
    await requireCapability("viewAudit");
    return auditRepository.listForEntity(entity, entityId);
  },

  /**
   * The whole-log Activity Log read (Wave 2.5). `viewAudit`-gated. Normalizes the `from`/`to`
   * filters to UTC day-bounds, fetches one keyset page (`ACTIVITY_PAGE + 1` to probe `hasMore`),
   * batch-resolves actor names + candidate entity labels, and builds `ActivityItemDTO[]` WITHOUT
   * the raw `before`/`after` (only `hasChanges`). AuthZ is session-authoritative via
   * `requireCapability` (mirrors `listAuditForEntity` — no viewer arg to trust).
   */
  async listActivity(
    filters: AuditListFilters,
    cursor: PageCursor | null,
  ): Promise<ActivityListDTO> {
    await requireCapability("viewAudit"); // AL-6 — server authoritative, never trusts UI hiding.
    const repoFilters: AuditListFilters = {
      ...filters,
      ...(filters.from ? { from: utcDayStart(filters.from) } : {}),
      ...(filters.to ? { to: utcDayEnd(filters.to) } : {}),
    };
    const rows = (await auditRepository.list(
      repoFilters,
      cursor,
      ACTIVITY_PAGE + 1,
    )) as AuditListRow[];
    const hasMore = rows.length > ACTIVITY_PAGE;
    const page = hasMore ? rows.slice(0, ACTIVITY_PAGE) : rows;

    const [actorNames, candidates] = await Promise.all([
      userRepository.namesByIds(page.map((r) => r.actor)),
      candidateRepository.namesByIds(
        page.filter((r) => r.entity === "candidate").map((r) => r.entityId),
        { includeDeleted: true },
      ),
    ]);

    const items = page.map((r) => toActivityItem(r, actorNames, candidates));
    const last = page.at(-1);
    const nextCursor =
      hasMore && last ? encodeCursor({ at: last.at, id: last.id }, "at_desc") : null;
    return { items, nextCursor, hasMore };
  },

  /**
   * The on-demand detail — the whole-entity `before`/`after` snapshots for one row (AL-3). Same
   * `viewAudit` gate (PII permitted to holders). NOT_FOUND when the row is absent.
   */
  async getActivityDetail(id: string): Promise<ActivityDetailDTO> {
    await requireCapability("viewAudit");
    const row = await auditRepository.findById(id);
    if (!row) throw new AppError("NOT_FOUND", "Activity entry not found");
    return { id: row.id, before: row.before ?? null, after: row.after ?? null };
  },

  /**
   * The actor filter picker's options — the distinct actors that appear in the log, resolved to
   * names and sorted. `viewAudit`-gated (exposes only names the holder may already see).
   */
  async listActorOptions(): Promise<ActivityActorOption[]> {
    await requireCapability("viewAudit");
    const ids = await auditRepository.distinctActors();
    const names = await userRepository.namesByIds(ids);
    return ids
      .map((id) => ({ id, name: names.get(id) ?? "Unknown" }))
      .sort((a, b) => a.name.localeCompare(b.name));
  },
};
