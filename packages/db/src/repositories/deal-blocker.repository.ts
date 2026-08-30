import type { TenantContext } from "@destaworks/domain/tenant";
import type { DealBlocker, Prisma } from "../generated/prisma/client";
import { db, type ScopedTx } from "../tenant-scope";
import { CHILD_ROWS_CAP } from "../query-limits";

/** A raw deal-blocker row (Prisma model). Services/DTOs map this to API shapes. */
export type DealBlockerRow = DealBlocker;

/**
 * Deal-blocker data access (Wave 4.2 slice 3, CRM) — the ONLY layer that touches Prisma for
 * `deal_blockers`. Hard-deletable (a small checklist item, no soft-delete — `resolved` already
 * captures the audit-worthy state).
 */
export const dealBlockerRepository = {
  create(ctx: TenantContext, data: Prisma.DealBlockerUncheckedCreateInput, tx?: ScopedTx) {
    return db(ctx, tx).dealBlocker.create({ data });
  },

  listForDeal(ctx: TenantContext, dealId: string, tx?: ScopedTx) {
    return db(ctx, tx).dealBlocker.findMany({
      where: { dealId },
      orderBy: { createdAt: "asc" },
      take: CHILD_ROWS_CAP,
    });
  },

  /** Batched `listForDeal` for a set of deals — perf audit 2026-08-16: the client-detail read was
   *  issuing one query per deal. Group the flat result by `dealId` on the caller's side. */
  listForDeals(ctx: TenantContext, dealIds: string[], tx?: ScopedTx) {
    if (dealIds.length === 0) return Promise.resolve([]);
    return db(ctx, tx).dealBlocker.findMany({
      where: { dealId: { in: dealIds } },
      orderBy: { createdAt: "asc" },
    });
  },

  /** One blocker, scoped to its deal — the read-back after an `update`, which needs the single
   *  updated row and not the deal's whole checklist. */
  findInDeal(ctx: TenantContext, dealId: string, id: string, tx?: ScopedTx) {
    return db(ctx, tx).dealBlocker.findFirst({ where: { id, dealId } });
  },

  /** Scoped to `dealId` — an id belonging to another deal is a 0-row no-op, never cross-deal. */
  async update(
    ctx: TenantContext,
    dealId: string,
    id: string,
    data: Prisma.DealBlockerUncheckedUpdateInput,
    tx?: ScopedTx,
  ) {
    const { count } = await db(ctx, tx).dealBlocker.updateMany({ where: { id, dealId }, data });
    return count;
  },

  async delete(ctx: TenantContext, dealId: string, id: string, tx?: ScopedTx) {
    const { count } = await db(ctx, tx).dealBlocker.deleteMany({ where: { id, dealId } });
    return count;
  },
};
