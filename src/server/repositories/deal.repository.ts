import "server-only";
import type { Deal, Prisma } from "@/generated/prisma/client";
import { db } from "@/server/db/prisma";

/** A raw deal row (Prisma model). Services/DTOs map this to API shapes. */
export type DealRow = Deal;

/**
 * Deal data access (Wave 4.2 slice 3, CRM) — the ONLY layer that touches Prisma for `deals`.
 * Soft-deleted rows are excluded from reads by default, matching every other CRM repository.
 */
export const dealRepository = {
  create(data: Prisma.DealUncheckedCreateInput, tx?: Prisma.TransactionClient) {
    return db(tx).deal.create({ data });
  },

  findById(id: string, tx?: Prisma.TransactionClient) {
    return db(tx).deal.findUnique({ where: { id } });
  },

  listForClient(clientId: string, tx?: Prisma.TransactionClient) {
    return db(tx).deal.findMany({
      where: { clientId, deletedAt: null },
      orderBy: { createdAt: "desc" },
    });
  },

  /** Scoped to `clientId` — an id belonging to another client is a 0-row no-op, never cross-client. */
  async update(
    clientId: string,
    id: string,
    data: Prisma.DealUncheckedUpdateInput,
    tx?: Prisma.TransactionClient,
  ) {
    const { count } = await db(tx).deal.updateMany({ where: { id, clientId }, data });
    return count;
  },

  async softDelete(clientId: string, id: string, actorId: string, tx?: Prisma.TransactionClient) {
    const { count } = await db(tx).deal.updateMany({
      where: { id, clientId },
      data: { deletedAt: new Date(), deletedById: actorId },
    });
    return count;
  },
};
