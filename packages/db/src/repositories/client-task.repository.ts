import "server-only";
import type { ClientTask, Prisma } from "../generated/prisma/client";
import { db } from "../prisma";

/** A raw client-task row (Prisma model). Services/DTOs map this to API shapes. */
export type ClientTaskRow = ClientTask;

/**
 * Client-task data access (Wave 4.2 slice 2, CRM) — the ONLY layer that touches Prisma for
 * `client_tasks`. Soft-deleted rows are excluded from reads by default, matching the contact
 * repository's contract exactly.
 */
export const clientTaskRepository = {
  create(data: Prisma.ClientTaskUncheckedCreateInput, tx?: Prisma.TransactionClient) {
    return db(tx).clientTask.create({ data });
  },

  findById(id: string, tx?: Prisma.TransactionClient) {
    return db(tx).clientTask.findUnique({ where: { id } });
  },

  listForClient(clientId: string, tx?: Prisma.TransactionClient) {
    return db(tx).clientTask.findMany({
      where: { clientId, deletedAt: null },
      orderBy: { createdAt: "desc" },
    });
  },

  /** Same as `listForClient`, batched across many clients in one query — feeds `/crm/compare`,
   *  which previously ran one `listForClient` per client (perf audit 2026-08-15). */
  listForClients(clientIds: string[], tx?: Prisma.TransactionClient) {
    return db(tx).clientTask.findMany({
      where: { clientId: { in: clientIds }, deletedAt: null },
    });
  },

  /** Scoped to `clientId` — an id belonging to another client is a 0-row no-op, never cross-client. */
  async update(
    clientId: string,
    id: string,
    data: Prisma.ClientTaskUncheckedUpdateInput,
    tx?: Prisma.TransactionClient,
  ) {
    const { count } = await db(tx).clientTask.updateMany({ where: { id, clientId }, data });
    return count;
  },

  async softDelete(clientId: string, id: string, actorId: string, tx?: Prisma.TransactionClient) {
    const { count } = await db(tx).clientTask.updateMany({
      where: { id, clientId },
      data: { deletedAt: new Date(), deletedById: actorId },
    });
    return count;
  },
};
