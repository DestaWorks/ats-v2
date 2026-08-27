import type { ClientNote, Prisma } from "../generated/prisma/client";
import { db } from "../prisma";

/** A raw client-note row (Prisma model). Services/DTOs map this to API shapes. */
export type ClientNoteRow = ClientNote;

/**
 * Client-note data access (Wave 4.2, Health Score slice, CRM) — the ONLY layer that touches
 * Prisma for `client_notes`. Same append + soft-delete-for-correction shape as
 * `client-meeting.repository.ts` (no `update` — a note is a point-in-time log entry).
 */
export const clientNoteRepository = {
  create(data: Prisma.ClientNoteUncheckedCreateInput, tx?: Prisma.TransactionClient) {
    return db(tx).clientNote.create({ data });
  },

  listForClient(clientId: string, tx?: Prisma.TransactionClient) {
    return db(tx).clientNote.findMany({
      where: { clientId, deletedAt: null },
      orderBy: { createdAt: "desc" },
    });
  },

  /** Same as `listForClient`, batched across many clients in one query — feeds `/crm/compare`,
   *  which previously ran one `listForClient` per client (perf audit 2026-08-15). */
  listForClients(clientIds: string[], tx?: Prisma.TransactionClient) {
    return db(tx).clientNote.findMany({
      where: { clientId: { in: clientIds }, deletedAt: null },
    });
  },

  async softDelete(clientId: string, id: string, actorId: string, tx?: Prisma.TransactionClient) {
    const { count } = await db(tx).clientNote.updateMany({
      where: { id, clientId },
      data: { deletedAt: new Date(), deletedById: actorId },
    });
    return count;
  },
};
