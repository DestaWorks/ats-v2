import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/server/db/prisma";
import type { AuditAction, AuditEntity } from "@/lib/constants";
import type { PageCursor } from "@/lib/validation/cursor";

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
  /** Inclusive lower bound on `at` (UTC day-start, computed in the service). */
  from?: Date;
  /** Inclusive upper bound on `at` (UTC day-end, computed in the service). */
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
            ...(filters.to ? { lte: filters.to } : {}),
          },
        }
      : {}),
  };
}

export const auditRepository = {
  listForEntity(entity: string, entityId: string) {
    return prisma.activityLog.findMany({
      where: { entity, entityId },
      orderBy: { at: "desc" },
    });
  },

  /**
   * One keyset page of the whole log, newest-first (`at desc, id desc`). Applies the filter `where`
   * plus the keyset predicate for a `(at, id)` cursor, and fetches `take` rows (the service passes
   * `pageSize + 1` to probe `hasMore`). SELECTS `before`/`after` ONLY so the service can compute
   * `hasChanges` — the raw blobs are dropped before the DTO (AL-3), never shipped to the client.
   */
  list(filters: AuditListFilters, cursor: PageCursor | null, take: number) {
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
    return prisma.activityLog.findMany({
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
  findById(id: string) {
    return prisma.activityLog.findUnique({ where: { id } });
  },

  /** The distinct actor ids that appear in the log (for the actor filter picker). */
  distinctActors(): Promise<string[]> {
    return prisma.activityLog.groupBy({ by: ["actor"] }).then((rows) => rows.map((r) => r.actor));
  },
};
