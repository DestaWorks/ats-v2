import "server-only";
import type { ClientMeeting, Prisma } from "@/generated/prisma/client";
import { db } from "@/server/db/prisma";

/** A raw client-meeting row (Prisma model). Services/DTOs map this to API shapes. */
export type ClientMeetingRow = ClientMeeting;

/**
 * Client-meeting data access (Wave 4.2 slice 2, CRM) — the ONLY layer that touches Prisma for
 * `client_meetings`. No `update` method — meetings are genuinely append-only in legacy (no edit
 * anywhere) and stay that way here; correction is soft-delete only, matching `CandidateNote`.
 */
export const clientMeetingRepository = {
  create(data: Prisma.ClientMeetingUncheckedCreateInput, tx?: Prisma.TransactionClient) {
    return db(tx).clientMeeting.create({ data });
  },

  listForClient(clientId: string, tx?: Prisma.TransactionClient) {
    return db(tx).clientMeeting.findMany({
      where: { clientId, deletedAt: null },
      orderBy: { createdAt: "desc" },
    });
  },

  async softDelete(clientId: string, id: string, actorId: string, tx?: Prisma.TransactionClient) {
    const { count } = await db(tx).clientMeeting.updateMany({
      where: { id, clientId },
      data: { deletedAt: new Date(), deletedById: actorId },
    });
    return count;
  },
};
