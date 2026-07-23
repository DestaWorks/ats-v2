import "server-only";
import type { ClientContact, Prisma } from "@/generated/prisma/client";
import { db } from "@/server/db/prisma";

/** A raw client-contact row (Prisma model). Services/DTOs map this to API shapes. */
export type ClientContactRow = ClientContact;

/**
 * Client-contact data access (Wave 4.2, CRM) — the ONLY layer that touches Prisma for
 * `client_contacts`. Soft-deleted rows are excluded from reads by default (mirrors the
 * candidate/lead/note repositories); a "left" contact (`status`) stays visible until explicitly
 * deleted — those are separate concerns, matching legacy parity.
 */
export const clientContactRepository = {
  create(data: Prisma.ClientContactUncheckedCreateInput, tx?: Prisma.TransactionClient) {
    return db(tx).clientContact.create({ data });
  },

  findById(id: string, tx?: Prisma.TransactionClient) {
    return db(tx).clientContact.findUnique({ where: { id } });
  },

  listForClient(clientId: string, tx?: Prisma.TransactionClient) {
    return db(tx).clientContact.findMany({
      where: { clientId, deletedAt: null },
      orderBy: { fullName: "asc" },
    });
  },

  /** Scoped to `clientId` — an id belonging to another client is a 0-row no-op, never cross-client. */
  async update(
    clientId: string,
    id: string,
    data: Prisma.ClientContactUncheckedUpdateInput,
    tx?: Prisma.TransactionClient,
  ) {
    const { count } = await db(tx).clientContact.updateMany({ where: { id, clientId }, data });
    return count;
  },

  async softDelete(clientId: string, id: string, actorId: string, tx?: Prisma.TransactionClient) {
    const { count } = await db(tx).clientContact.updateMany({
      where: { id, clientId },
      data: { deletedAt: new Date(), deletedById: actorId },
    });
    return count;
  },
};
