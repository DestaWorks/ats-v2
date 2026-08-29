import type { TenantContext } from "@destaworks/domain/tenant";
import type { Prisma } from "../generated/prisma/client";
import { bridgeUnscopedCallers, db, type ScopedTx } from "../tenant-scope";

/** Lifecycle of one requested export. `ready` is the only state with a `storageKey`. */
export type ReportExportStatus = "pending" | "ready" | "failed";

export interface ReportExportRow {
  id: string;
  requestedById: string;
  filters: Prisma.JsonValue;
  status: string;
  storageKey: string | null;
  byteSize: number | null;
  errorCode: string | null;
  createdAt: Date;
  readyAt: Date | null;
}

export const reportExportRepository = bridgeUnscopedCallers({
  /**
   * Record the request. Accepts a transaction so the row and the job that fulfils it can be
   * committed together — the queue port's `tx` option exists for exactly this pairing.
   */
  async create(
    ctx: TenantContext,
    requestedById: string,
    filters: Prisma.InputJsonValue,
    tx?: ScopedTx,
  ): Promise<ReportExportRow> {
    return db(ctx, tx).reportExport.create({ data: { requestedById, filters } });
  },

  async findById(ctx: TenantContext, id: string, tx?: ScopedTx): Promise<ReportExportRow | null> {
    return db(ctx, tx).reportExport.findUnique({ where: { id } });
  },

  async markReady(
    ctx: TenantContext,
    id: string,
    storageKey: string,
    byteSize: number,
    readyAt: Date,
    tx?: ScopedTx,
  ): Promise<void> {
    await db(ctx, tx).reportExport.update({
      where: { id },
      data: { status: "ready", storageKey, byteSize, readyAt, errorCode: null },
    });
  },

  /** `errorCode` is an `AppError` code only — never a message, which could quote row data. */
  async markFailed(
    ctx: TenantContext,
    id: string,
    errorCode: string,
    tx?: ScopedTx,
  ): Promise<void> {
    await db(ctx, tx).reportExport.update({ where: { id }, data: { status: "failed", errorCode } });
  },
});
