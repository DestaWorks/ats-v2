import type { TenantContext } from "@destaworks/domain/tenant";
import type { ClientTask, Prisma } from "../generated/prisma/client";
import { db, type ScopedTx, type SeamWrite, scopedWrite } from "../tenant-scope";

/** A raw client-task row (Prisma model). Services/DTOs map this to API shapes. */
export type ClientTaskRow = ClientTask;

/**
 * Client-task data access (Wave 4.2 slice 2, CRM) — the ONLY layer that touches Prisma for
 * `client_tasks`. Soft-deleted rows are excluded from reads by default, matching the contact
 * repository's contract exactly.
 */
export const clientTaskRepository = {
  create(
    ctx: TenantContext,
    data: SeamWrite<Prisma.ClientTaskUncheckedCreateInput>,
    tx?: ScopedTx,
  ) {
    return db(ctx, tx).clientTask.create({ data: scopedWrite(data) });
  },

  findById(ctx: TenantContext, id: string, tx?: ScopedTx) {
    return db(ctx, tx).clientTask.findUnique({ where: { id } });
  },

  listForClient(ctx: TenantContext, clientId: string, tx?: ScopedTx) {
    return db(ctx, tx).clientTask.findMany({
      where: { clientId, deletedAt: null },
      orderBy: { createdAt: "desc" },
    });
  },

  /** Same as `listForClient`, batched across many clients in one query — feeds `/crm/compare`,
   *  which previously ran one `listForClient` per client (perf audit 2026-08-15). */
  listForClients(ctx: TenantContext, clientIds: string[], tx?: ScopedTx) {
    return db(ctx, tx).clientTask.findMany({
      where: { clientId: { in: clientIds }, deletedAt: null },
    });
  },

  /** Scoped to `clientId` — an id belonging to another client is a 0-row no-op, never cross-client. */
  async update(
    ctx: TenantContext,
    clientId: string,
    id: string,
    data: Prisma.ClientTaskUncheckedUpdateInput,
    tx?: ScopedTx,
  ) {
    const { count } = await db(ctx, tx).clientTask.updateMany({ where: { id, clientId }, data });
    return count;
  },

  async softDelete(
    ctx: TenantContext,
    clientId: string,
    id: string,
    actorId: string,
    tx?: ScopedTx,
  ) {
    const { count } = await db(ctx, tx).clientTask.updateMany({
      where: { id, clientId },
      data: { deletedAt: new Date(), deletedById: actorId },
    });
    return count;
  },
};
