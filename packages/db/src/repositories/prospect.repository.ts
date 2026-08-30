import type { TenantContext } from "@destaworks/domain/tenant";
import type { Prisma, Prospect } from "../generated/prisma/client";
import { db, type ScopedTx, type SeamWrite, scopedWrite } from "../tenant-scope";
import { MAX_ROWS_CAP } from "../query-limits";

/** A raw prospect row (Prisma model). Services/DTOs map this to API shapes. */
export type ProspectRow = Prospect;

/** Filters for `list`/`count`. Soft-deleted rows are excluded unless `includeDeleted`. */
export interface ProspectListFilters {
  /** Equality on the prospect status label (a `ProspectStatus`). */
  status?: string;
  /** Equality on the assigned owner. */
  ownerId?: string;
  /** Equality on the source ("NPPES Search" | "Manual"). */
  source?: string;
  /** Free-text match on practice name (case-insensitive). */
  search?: string;
  includeDeleted?: boolean;
  /** OFFSET skip for the numbered pager (the service computes `(page-1) * pageSize`). */
  skip?: number;
  /** Cap the rows returned (one offset page). */
  take?: number;
}

/**
 * Build the shared `where` for a prospect read — mirrors `buildLeadWhere` exactly. Soft-deleted
 * rows are excluded unless `includeDeleted`.
 */
export function buildProspectWhere(filters: ProspectListFilters): Prisma.ProspectWhereInput {
  const where: Prisma.ProspectWhereInput = {};
  if (!filters.includeDeleted) where.deletedAt = null;
  if (filters.status) where.status = filters.status;
  if (filters.ownerId) where.ownerId = filters.ownerId;
  if (filters.source) where.source = filters.source;
  if (filters.search) where.practiceName = { contains: filters.search, mode: "insensitive" };
  return where;
}

/**
 * Prospect data access — the ONLY layer that touches Prisma for Client Discovery prospects.
 *
 * SOFT DELETE: this repository is the enforcement point (mirrors `leadRepository`). Reads add
 * `deletedAt: null` unless `includeDeleted`. Every method accepts an optional `tx` so the service
 * can compose atomic writes (bulk-add + audit, status update + audit).
 */
export const prospectRepository = {
  create(ctx: TenantContext, data: SeamWrite<Prisma.ProspectUncheckedCreateInput>, tx?: ScopedTx) {
    return db(ctx, tx).prospect.create({ data: scopedWrite(data) });
  },

  findById(ctx: TenantContext, id: string, opts?: { includeDeleted?: boolean }, tx?: ScopedTx) {
    return db(ctx, tx).prospect.findFirst({
      where: { id, ...(opts?.includeDeleted ? {} : { deletedAt: null }) },
    });
  },

  /** The core read. `where` from `buildProspectWhere`, ordered `createdAt desc` (id tiebreak),
   *  one OFFSET page (`skip`/`take` — the numbered pager, mirroring `leadRepository.list`). */
  list(ctx: TenantContext, filters: ProspectListFilters = {}, tx?: ScopedTx) {
    return db(ctx, tx).prospect.findMany({
      where: buildProspectWhere(filters),
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      ...(filters.skip !== undefined ? { skip: filters.skip } : {}),
      take: filters.take ?? MAX_ROWS_CAP,
    });
  },

  /** True filtered total for the same `where` as `list` (minus skip/take). */
  count(ctx: TenantContext, filters: ProspectListFilters = {}, tx?: ScopedTx) {
    return db(ctx, tx).prospect.count({ where: buildProspectWhere(filters) });
  },

  /**
   * Patch MANY prospects at once — one statement for a bulk action instead of one per row.
   * Returns the affected count; ids belonging to no live prospect are simply not matched.
   */
  async bulkUpdate(
    ctx: TenantContext,
    ids: string[],
    data: Prisma.ProspectUncheckedUpdateManyInput,
    tx?: ScopedTx,
  ) {
    if (ids.length === 0) return 0;
    const { count } = await db(ctx, tx).prospect.updateMany({ where: { id: { in: ids } }, data });
    return count;
  },

  /** Patch a prospect — status / owner / notes. */
  update(ctx: TenantContext, id: string, data: Prisma.ProspectUncheckedUpdateInput, tx?: ScopedTx) {
    return db(ctx, tx).prospect.update({ where: { id }, data });
  },

  softDelete(ctx: TenantContext, id: string, actorId: string, tx?: ScopedTx) {
    return db(ctx, tx).prospect.update({
      where: { id },
      data: { deletedAt: new Date(), deletedById: actorId },
    });
  },

  /** Clear the soft-delete markers — the prospect returns exactly as it was (status untouched). */
  restore(ctx: TenantContext, id: string, tx?: ScopedTx) {
    return db(ctx, tx).prospect.update({
      where: { id },
      data: { deletedAt: null, deletedById: null },
    });
  },

  /**
   * Non-deleted prospects matching any of the given ids — the working set a bulk action resolves
   * and then decides eligibility from. Three columns, mirroring `leadRepository.findManyByIds`:
   * the id to act on, the status the eligibility rule keys off, and the delete-state that
   * separates `delete` from `restore`.
   */
  findManyByIds(
    ctx: TenantContext,
    ids: string[],
    opts?: { includeDeleted?: boolean },
    tx?: ScopedTx,
  ) {
    return db(ctx, tx).prospect.findMany({
      where: { id: { in: ids }, ...(opts?.includeDeleted ? {} : { deletedAt: null }) },
      select: { id: true, status: true, deletedAt: true },
    });
  },

  /** Existing (incl. soft-deleted) prospects matching any of these NPIs — search-result dedupe,
   *  delete-agnostic like `leadRepository.findManyByNpis` (a soft-deleted prospect still blocks
   *  a duplicate re-add from the same search). */
  findManyByNpis(ctx: TenantContext, npis: string[], tx?: ScopedTx) {
    if (npis.length === 0) return Promise.resolve([]);
    return db(ctx, tx).prospect.findMany({
      where: { npi: { in: npis } },
      select: { id: true, npi: true, practiceName: true, status: true },
    });
  },

  /** Bulk insert (search-result "add to pipeline") — rows are pre-deduped by the service.
   *  `skipDuplicates` defends the `npi` unique constraint against a concurrent add. */
  createMany(ctx: TenantContext, rows: SeamWrite<Prisma.ProspectCreateManyInput>[], tx?: ScopedTx) {
    return db(ctx, tx).prospect.createMany({ data: rows.map(scopedWrite), skipDuplicates: true });
  },
};
