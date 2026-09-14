import type { TenantContext } from "@destaworks/domain/tenant";
import type { ClientContact, Prisma } from "../generated/prisma/client";
import { db, type ScopedTx, type SeamWrite, scopedWrite } from "../tenant-scope";
import { CHILD_ROWS_CAP } from "../query-limits";

/** A raw client-contact row (Prisma model). Services/DTOs map this to API shapes. */
export type ClientContactRow = ClientContact;

/**
 * Client-contact data access (Wave 4.2, CRM) — the ONLY layer that touches Prisma for
 * `client_contacts`. Soft-deleted rows are excluded from reads by default (mirrors the
 * candidate/lead/note repositories); a "left" contact (`status`) stays visible until explicitly
 * deleted — those are separate concerns, matching legacy parity.
 */
export const clientContactRepository = {
  create(
    ctx: TenantContext,
    data: SeamWrite<Prisma.ClientContactUncheckedCreateInput>,
    tx?: ScopedTx,
  ) {
    return db(ctx, tx).clientContact.create({ data: scopedWrite(data) });
  },

  findById(ctx: TenantContext, id: string, tx?: ScopedTx) {
    return db(ctx, tx).clientContact.findUnique({ where: { id } });
  },

  listForClient(ctx: TenantContext, clientId: string, tx?: ScopedTx) {
    return db(ctx, tx).clientContact.findMany({
      where: { clientId, deletedAt: null },
      orderBy: { fullName: "asc" },
      take: CHILD_ROWS_CAP,
    });
  },

  /** Scoped to `clientId` — an id belonging to another client is a 0-row no-op, never cross-client. */
  async update(
    ctx: TenantContext,
    clientId: string,
    id: string,
    data: Prisma.ClientContactUncheckedUpdateInput,
    tx?: ScopedTx,
  ) {
    const { count } = await db(ctx, tx).clientContact.updateMany({ where: { id, clientId }, data });
    return count;
  },

  async softDelete(
    ctx: TenantContext,
    clientId: string,
    id: string,
    actorId: string,
    tx?: ScopedTx,
  ) {
    const { count } = await db(ctx, tx).clientContact.updateMany({
      where: { id, clientId },
      data: { deletedAt: new Date(), deletedById: actorId },
    });
    return count;
  },
};
