import type { TenantContext } from "@destaworks/domain/tenant";
import type { ClientMeeting, Prisma } from "../generated/prisma/client";
import { db, type ScopedTx } from "../tenant-scope";
import { CHILD_ROWS_CAP } from "../query-limits";

/** A raw client-meeting row (Prisma model). Services/DTOs map this to API shapes. */
export type ClientMeetingRow = ClientMeeting;

/**
 * Client-meeting data access (Wave 4.2 slice 2, CRM) — the ONLY layer that touches Prisma for
 * `client_meetings`. No `update` method — meetings are genuinely append-only in legacy (no edit
 * anywhere) and stay that way here; correction is soft-delete only, matching `CandidateNote`.
 */
export const clientMeetingRepository = {
  create(ctx: TenantContext, data: Prisma.ClientMeetingUncheckedCreateInput, tx?: ScopedTx) {
    return db(ctx, tx).clientMeeting.create({ data });
  },

  listForClient(ctx: TenantContext, clientId: string, tx?: ScopedTx) {
    return db(ctx, tx).clientMeeting.findMany({
      where: { clientId, deletedAt: null },
      orderBy: { createdAt: "desc" },
      take: CHILD_ROWS_CAP,
    });
  },

  /** Batched across many clients in one query — feeds `/crm/compare`, which previously ran one
   *  `listForClient` per client (perf audit 2026-08-15). Two columns only: the health formula
   *  counts meetings and takes the latest `createdAt`, so `notes`/`actionItems`/`attendees` never
   *  leave the database for a comparison view. */
  listForClients(ctx: TenantContext, clientIds: string[], tx?: ScopedTx) {
    return db(ctx, tx).clientMeeting.findMany({
      where: { clientId: { in: clientIds }, deletedAt: null },
      select: { clientId: true, createdAt: true },
    });
  },

  async softDelete(
    ctx: TenantContext,
    clientId: string,
    id: string,
    actorId: string,
    tx?: ScopedTx,
  ) {
    const { count } = await db(ctx, tx).clientMeeting.updateMany({
      where: { id, clientId },
      data: { deletedAt: new Date(), deletedById: actorId },
    });
    return count;
  },
};
