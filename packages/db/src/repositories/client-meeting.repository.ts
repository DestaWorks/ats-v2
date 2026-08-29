import type { TenantContext } from "@destaworks/domain/tenant";
import type { ClientMeeting, Prisma } from "../generated/prisma/client";
import { db, type ScopedTx } from "../tenant-scope";

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
    });
  },

  /** Same as `listForClient`, batched across many clients in one query — feeds `/crm/compare`,
   *  which previously ran one `listForClient` per client (perf audit 2026-08-15). */
  listForClients(ctx: TenantContext, clientIds: string[], tx?: ScopedTx) {
    return db(ctx, tx).clientMeeting.findMany({
      where: { clientId: { in: clientIds }, deletedAt: null },
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
