import "server-only";
import type { DealBlocker, Prisma } from "@/generated/prisma/client";
import { db } from "@/server/db/prisma";

/** A raw deal-blocker row (Prisma model). Services/DTOs map this to API shapes. */
export type DealBlockerRow = DealBlocker;

/**
 * Deal-blocker data access (Wave 4.2 slice 3, CRM) — the ONLY layer that touches Prisma for
 * `deal_blockers`. Hard-deletable (a small checklist item, no soft-delete — `resolved` already
 * captures the audit-worthy state).
 */
export const dealBlockerRepository = {
  create(data: Prisma.DealBlockerUncheckedCreateInput, tx?: Prisma.TransactionClient) {
    return db(tx).dealBlocker.create({ data });
  },

  listForDeal(dealId: string, tx?: Prisma.TransactionClient) {
    return db(tx).dealBlocker.findMany({ where: { dealId }, orderBy: { createdAt: "asc" } });
  },

  /** Scoped to `dealId` — an id belonging to another deal is a 0-row no-op, never cross-deal. */
  async update(
    dealId: string,
    id: string,
    data: Prisma.DealBlockerUncheckedUpdateInput,
    tx?: Prisma.TransactionClient,
  ) {
    const { count } = await db(tx).dealBlocker.updateMany({ where: { id, dealId }, data });
    return count;
  },

  async delete(dealId: string, id: string, tx?: Prisma.TransactionClient) {
    const { count } = await db(tx).dealBlocker.deleteMany({ where: { id, dealId } });
    return count;
  },
};
