import type { TenantContext } from "@destaworks/domain/tenant";
import type { Prisma } from "../generated/prisma/client";
import { bridgeUnscopedCallers, db } from "../tenant-scope";
import type { AuditAction, AuditEntity } from "@destaworks/domain/constants";
import type { PageCursor } from "@destaworks/contracts/validation/cursor";

/**
 * Audit-trail data access. Repositories are the ONLY layer that touches Prisma.
 * (Writes happen transactionally via `server/db/audit.ts`; this repo owns reads.)
 *
 * Two read surfaces: `listForEntity` (the per-entity trail, Wave 0.5) and the Wave 2.5 whole-log
 * Activity Log (`list`/`findById`/`distinctActors`). The list is keyset-paginated `at desc` and
 * SELECTS `before`/`after` only so the service can derive `hasChanges` — the service drops the raw
 * blobs at the DTO boundary (AL-3), so the snapshots never leave the server for the list.
 */

/** Filters for the whole-log `list` — all optional (empty = the unfiltered whole-log read). */
export interface AuditListFilters {
  action?: AuditAction;
  entity?: AuditEntity;
  actor?: string;
  /** Inclusive lower bound on `at` (`utcDayStart`, computed in the service). */
  from?: Date;
  /** EXCLUSIVE upper bound on `at` (`utcNextDayStart`, computed in the service) — the same
   *  half-open `[from, to)` window `candidate.repository`'s `addedFrom`/`addedTo` uses. */
  to?: Date;
}

/** Build the filter `where` shared by `list` (the keyset OR is added separately). */
function filterWhere(filters: AuditListFilters): Prisma.ActivityLogWhereInput {
  return {
    ...(filters.action ? { action: filters.action } : {}),
    ...(filters.entity ? { entity: filters.entity } : {}),
    ...(filters.actor ? { actor: filters.actor } : {}),
    ...(filters.from || filters.to
      ? {
          at: {
            ...(filters.from ? { gte: filters.from } : {}),
            ...(filters.to ? { lt: filters.to } : {}),
          },
        }
      : {}),
  };
}

/** Cap on `listForEntity` — was unbounded (perf audit 2026-08-03); a single long-lived entity
 *  (e.g. a candidate that's been in the pipeline for months) could otherwise return its entire
 *  history in one query. 200 comfortably covers any real per-entity trail while staying bounded. */
const ENTITY_TRAIL_CAP = 200;

export const auditRepository = bridgeUnscopedCallers({
  listForEntity(ctx: TenantContext, entity: string, entityId: string) {
    return db(ctx).activityLog.findMany({
      where: { entity, entityId },
      orderBy: { at: "desc" },
      take: ENTITY_TRAIL_CAP,
    });
  },

  /**
   * One keyset page of the whole log, newest-first (`at desc, id desc`). Applies the filter `where`
   * plus the keyset predicate for a `(at, id)` cursor, and fetches `take` rows (the service passes
   * `pageSize + 1` to probe `hasMore`). SELECTS `before`/`after` ONLY so the service can compute
   * `hasChanges` — the raw blobs are dropped before the DTO (AL-3), never shipped to the client.
   */
  list(ctx: TenantContext, filters: AuditListFilters, cursor: PageCursor | null, take: number) {
    const where: Prisma.ActivityLogWhereInput = {
      ...filterWhere(filters),
      ...(cursor
        ? {
            OR: [
              { at: { lt: new Date(cursor.value) } },
              { at: new Date(cursor.value), id: { lt: cursor.id } },
            ],
          }
        : {}),
    };
    return db(ctx).activityLog.findMany({
      where,
      orderBy: [{ at: "desc" }, { id: "desc" }],
      take,
      select: {
        id: true,
        at: true,
        actor: true,
        action: true,
        entity: true,
        entityId: true,
        // Selected ONLY to derive `hasChanges` in the service; dropped before the DTO (AL-3).
        before: true,
        after: true,
      },
    });
  },

  /** The ONE row with its snapshots — the on-demand detail read (AL-3). Includes `before`/`after`. */
  findById(ctx: TenantContext, id: string) {
    return db(ctx).activityLog.findUnique({ where: { id } });
  },

  /** The distinct actor ids that appear in the log (for the actor filter picker). */
  distinctActors(ctx: TenantContext): Promise<string[]> {
    return db(ctx)
      .activityLog.groupBy({ by: ["actor"] })
      .then((rows) => rows.map((r) => r.actor));
  },
});
