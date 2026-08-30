import type { TenantContext } from "@destaworks/domain/tenant";
import type { OpenRole, Prisma } from "../generated/prisma/client";
import { db, type ScopedTx } from "../tenant-scope";
import { CHILD_ROWS_CAP, MAX_ROWS_CAP, REFERENCE_ROWS_CAP } from "../query-limits";

/** A raw open-role row (Prisma model). Services/DTOs map this to API shapes. */
export type OpenRoleRow = OpenRole;

/** Filters for the roles list/count. Roles are hard-deleted (legacy parity) — no `deletedAt` filter. */
export interface OpenRoleFilters {
  clientId?: string;
  status?: string;
  priority?: string;
  /** Free-text match on title (case-insensitive). */
  search?: string;
}

function buildWhere(filters: OpenRoleFilters): Prisma.OpenRoleWhereInput {
  return {
    ...(filters.clientId ? { clientId: filters.clientId } : {}),
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.priority ? { priority: filters.priority } : {}),
    ...(filters.search ? { title: { contains: filters.search, mode: "insensitive" } } : {}),
  };
}

/**
 * Open-role data access (Wave 3.5) — the ONLY layer that touches Prisma for roles/role-notes.
 * Roles are HARD-deleted (legacy `open_role_delete` has no undo) — no soft-delete filter anywhere
 * here, unlike candidates/leads. Every method accepts an optional `tx` so the service can compose
 * the write + `writeAudit` atomically.
 */
export const openRoleRepository = {
  create(ctx: TenantContext, data: Prisma.OpenRoleUncheckedCreateInput, tx?: ScopedTx) {
    return db(ctx, tx).openRole.create({ data });
  },

  findById(ctx: TenantContext, id: string, tx?: ScopedTx) {
    return db(ctx, tx).openRole.findUnique({ where: { id } });
  },

  /**
   * The role plus its client's match-profile weights, following the two foreign keys in ONE read.
   *
   * The matcher needs both and the profile hangs off `role.clientId`, so fetching them separately
   * costs two scoped transactions (see `tenant-scope.ts`: each repository call outside an ambient
   * transaction opens its own BEGIN/set_config/COMMIT) to answer one question.
   *
   * The nested read is NOT filtered by the tenant extension, which only stamps the top-level
   * `where` — it is scoped by the foreign key it follows plus the RLS policy on `client_match_
   * profiles`, which is evaluated on the same connection this query announced its tenant on.
   */
  findByIdWithMatchProfile(ctx: TenantContext, id: string, tx?: ScopedTx) {
    return db(ctx, tx).openRole.findUnique({
      where: { id },
      include: { client: { select: { matchProfile: true } } },
    });
  },

  /** Batch-fetch by ids (unordered) — for building `roleId → row` maps in the triage/matches reads. */
  findManyByIds(ctx: TenantContext, ids: string[], tx?: ScopedTx) {
    if (ids.length === 0) return Promise.resolve([]);
    return db(ctx, tx).openRole.findMany({ where: { id: { in: [...new Set(ids)] } } });
  },

  count(ctx: TenantContext, filters: OpenRoleFilters = {}, tx?: ScopedTx) {
    return db(ctx, tx).openRole.count({ where: buildWhere(filters) });
  },

  list(
    ctx: TenantContext,
    filters: OpenRoleFilters & { skip?: number; take?: number } = {},
    tx?: ScopedTx,
  ) {
    return db(ctx, tx).openRole.findMany({
      where: buildWhere(filters),
      orderBy: { createdAt: "desc" },
      ...(filters.skip !== undefined && { skip: filters.skip }),
      take: filters.take ?? MAX_ROWS_CAP,
    });
  },

  /** All non-terminal (Open/On Hold) roles — the triage strip's candidate pool. */
  listActive(ctx: TenantContext, tx?: ScopedTx) {
    return db(ctx, tx).openRole.findMany({
      where: { status: { notIn: ["Filled", "Closed"] } },
      orderBy: { openedAt: "asc" },
      take: REFERENCE_ROWS_CAP,
    });
  },

  /**
   * Open (non-terminal) roles grouped by (credential, state) — Discover's coverage-gap widget
   * (Wave 5.5 backlog, legacy Drop 68). Rows with either field null are excluded (no combo key).
   */
  groupOpenByCredentialState(ctx: TenantContext, tx?: ScopedTx) {
    return db(ctx, tx).openRole.groupBy({
      by: ["credential", "state"],
      where: {
        status: { notIn: ["Filled", "Closed"] },
        credential: { not: null },
        state: { not: null },
      },
      _count: { _all: true },
    });
  },

  /**
   * Open-role counts grouped by client, for a given set of client ids — the Client Funnel
   * report's per-client "Open Roles" column (client-reports.service.ts). Perf audit 2026-08-03:
   * was one `count()` per client run via `Promise.all`; this does the same aggregation in ONE
   * query.
   */
  countOpenByClient(ctx: TenantContext, clientIds: string[], tx?: ScopedTx) {
    if (clientIds.length === 0) return Promise.resolve([]);
    return db(ctx, tx).openRole.groupBy({
      by: ["clientId"],
      where: { clientId: { in: clientIds }, status: "Open" },
      _count: { _all: true },
    });
  },

  update(ctx: TenantContext, id: string, data: Prisma.OpenRoleUncheckedUpdateInput, tx?: ScopedTx) {
    return db(ctx, tx).openRole.update({ where: { id }, data });
  },

  /** Hard delete (legacy parity — no soft-delete/undo for roles). */
  delete(ctx: TenantContext, id: string, tx?: ScopedTx) {
    return db(ctx, tx).openRole.delete({ where: { id } });
  },

  // --- role notes ---

  createNote(
    ctx: TenantContext,
    data: {
      roleId: string;
      authorId: string;
      authorName: string | null;
      body: string;
      category: string;
    },
    tx?: ScopedTx,
  ) {
    return db(ctx, tx).roleNote.create({ data });
  },

  listNotes(ctx: TenantContext, roleId: string, tx?: ScopedTx) {
    return db(ctx, tx).roleNote.findMany({
      where: { roleId, deletedAt: null },
      orderBy: { createdAt: "desc" },
      take: CHILD_ROWS_CAP,
    });
  },

  softDeleteNote(ctx: TenantContext, id: string, roleId: string, actorId: string, tx?: ScopedTx) {
    return db(ctx, tx).roleNote.updateMany({
      where: { id, roleId, deletedAt: null },
      data: { deletedAt: new Date(), deletedById: actorId },
    });
  },
};
