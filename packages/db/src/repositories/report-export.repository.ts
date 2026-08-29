import type { Prisma } from "../generated/prisma/client";
import { db } from "../prisma";

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

export const reportExportRepository = {
  /**
   * Record the request. Accepts a transaction so the row and the job that fulfils it can be
   * committed together — the queue port's `tx` option exists for exactly this pairing.
   */
  async create(
    requestedById: string,
    filters: Prisma.InputJsonValue,
    tx?: Prisma.TransactionClient,
  ): Promise<ReportExportRow> {
    return db(tx).reportExport.create({ data: { requestedById, filters } });
  },

  async findById(id: string, tx?: Prisma.TransactionClient): Promise<ReportExportRow | null> {
    return db(tx).reportExport.findUnique({ where: { id } });
  },

  async markReady(
    id: string,
    storageKey: string,
    byteSize: number,
    readyAt: Date,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    await db(tx).reportExport.update({
      where: { id },
      data: { status: "ready", storageKey, byteSize, readyAt, errorCode: null },
    });
  },

  /** `errorCode` is an `AppError` code only — never a message, which could quote row data. */
  async markFailed(id: string, errorCode: string, tx?: Prisma.TransactionClient): Promise<void> {
    await db(tx).reportExport.update({ where: { id }, data: { status: "failed", errorCode } });
  },
};
