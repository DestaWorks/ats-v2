import type { TenantContext } from "@destaworks/domain/tenant";
import type { Deal, Prisma } from "../generated/prisma/client";
import { db, type ScopedTx } from "../tenant-scope";
import { CHILD_ROWS_CAP } from "../query-limits";

/** A raw deal row (Prisma model). Services/DTOs map this to API shapes. */
export type DealRow = Deal;

/**
 * Deal data access (Wave 4.2 slice 3, CRM) — the ONLY layer that touches Prisma for `deals`.
 * Soft-deleted rows are excluded from reads by default, matching every other CRM repository.
 */
export const dealRepository = {
  create(ctx: TenantContext, data: Prisma.DealUncheckedCreateInput, tx?: ScopedTx) {
    return db(ctx, tx).deal.create({ data });
  },

  findById(ctx: TenantContext, id: string, tx?: ScopedTx) {
    return db(ctx, tx).deal.findUnique({ where: { id } });
  },

  listForClient(ctx: TenantContext, clientId: string, tx?: ScopedTx) {
    return db(ctx, tx).deal.findMany({
      where: { clientId, deletedAt: null },
      orderBy: { createdAt: "desc" },
      take: CHILD_ROWS_CAP,
    });
  },

  /** Batched across many clients in one query — feeds `/crm/compare`, which previously ran one
   *  `listForClient` per client (perf audit 2026-08-15). Two columns only: the health formula
   *  counts deals and takes the latest `updatedAt`. */
  listForClients(ctx: TenantContext, clientIds: string[], tx?: ScopedTx) {
    return db(ctx, tx).deal.findMany({
      where: { clientId: { in: clientIds }, deletedAt: null },
      select: { clientId: true, updatedAt: true },
    });
  },

  /** Scoped to `clientId` — an id belonging to another client is a 0-row no-op, never cross-client. */
  async update(
    ctx: TenantContext,
    clientId: string,
    id: string,
    data: Prisma.DealUncheckedUpdateInput,
    tx?: ScopedTx,
  ) {
    const { count } = await db(ctx, tx).deal.updateMany({ where: { id, clientId }, data });
    return count;
  },

  async softDelete(
    ctx: TenantContext,
    clientId: string,
    id: string,
    actorId: string,
    tx?: ScopedTx,
  ) {
    const { count } = await db(ctx, tx).deal.updateMany({
      where: { id, clientId },
      data: { deletedAt: new Date(), deletedById: actorId },
    });
    return count;
  },
};
