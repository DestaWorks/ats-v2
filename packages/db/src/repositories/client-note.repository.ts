import type { TenantContext } from "@destaworks/domain/tenant";
import type { ClientNote, Prisma } from "../generated/prisma/client";
import { db, type ScopedTx } from "../tenant-scope";
import { CHILD_ROWS_CAP } from "../query-limits";

/** A raw client-note row (Prisma model). Services/DTOs map this to API shapes. */
export type ClientNoteRow = ClientNote;

/**
 * Client-note data access (Wave 4.2, Health Score slice, CRM) — the ONLY layer that touches
 * Prisma for `client_notes`. Same append + soft-delete-for-correction shape as
 * `client-meeting.repository.ts` (no `update` — a note is a point-in-time log entry).
 */
export const clientNoteRepository = {
  create(ctx: TenantContext, data: Prisma.ClientNoteUncheckedCreateInput, tx?: ScopedTx) {
    return db(ctx, tx).clientNote.create({ data });
  },

  listForClient(ctx: TenantContext, clientId: string, tx?: ScopedTx) {
    return db(ctx, tx).clientNote.findMany({
      where: { clientId, deletedAt: null },
      orderBy: { createdAt: "desc" },
      take: CHILD_ROWS_CAP,
    });
  },

  /** Batched across many clients in one query — feeds `/crm/compare`, which previously ran one
   *  `listForClient` per client (perf audit 2026-08-15). Two columns only: the health formula
   *  counts notes and takes the latest `createdAt`, so the free-text `body` never leaves the
   *  database for a comparison view. */
  listForClients(ctx: TenantContext, clientIds: string[], tx?: ScopedTx) {
    return db(ctx, tx).clientNote.findMany({
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
    const { count } = await db(ctx, tx).clientNote.updateMany({
      where: { id, clientId },
      data: { deletedAt: new Date(), deletedById: actorId },
    });
    return count;
  },
};
