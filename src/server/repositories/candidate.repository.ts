import "server-only";
import type { Candidate, Prisma } from "@/generated/prisma/client";
import type { CandidateStatus, Track } from "@/lib/constants";
import { prisma } from "@/server/db/prisma";
import { decryptField, encryptField } from "@/server/db/field-crypto";

/** A raw candidate row (Prisma model). Services/DTOs map this to API shapes. */
export type CandidateRow = Candidate;

/** Filters for `list`. Soft-deleted rows are excluded unless `includeDeleted` is set. */
export interface CandidateListFilters {
  status?: CandidateStatus;
  track?: Track;
  clientId?: string;
  /** Free-text match on name or email (case-insensitive). */
  search?: string;
  /** Match candidates carrying any of these tags. */
  tags?: string[];
  includeDeleted?: boolean;
  /** Cap the number of rows returned (bounds a browse/report read). */
  take?: number;
}

/** Resolve the client to use — the transaction client when composing writes, else the singleton. */
function db(tx?: Prisma.TransactionClient) {
  return tx ?? prisma;
}

/**
 * FIELD ENCRYPTION BOUNDARY (see `server/db/field-crypto`). `licenseNumber` is encrypted at rest
 * when `FIELD_ENCRYPTION_KEY` is set (no-op passthrough otherwise). We encrypt only a plaintext
 * string value on write — a `null` (clear) or an undefined (leave) passes through untouched, and a
 * value already carrying the `enc:v1:` prefix is not double-encrypted. Reads decrypt (mixed-safe via
 * the prefix), so services/DTOs only ever see plaintext and the `viewCredentials` gate still applies.
 */
function encryptLicense<T>(data: T): T {
  const d = data as { licenseNumber?: unknown };
  if (typeof d.licenseNumber === "string" && !d.licenseNumber.startsWith("enc:v1:")) {
    return { ...data, licenseNumber: encryptField(d.licenseNumber) };
  }
  return data;
}

/** Decrypt `licenseNumber` on a row read back from the DB (passthrough for `null`/legacy plaintext). */
function decryptRow<T extends Candidate | null>(row: T): T {
  if (row && row.licenseNumber !== null) {
    return { ...row, licenseNumber: decryptField(row.licenseNumber) };
  }
  return row;
}

/**
 * Candidate data access — the ONLY layer that touches Prisma for candidates.
 *
 * SOFT DELETE: this repository is the enforcement point. Reads add `deletedAt: null` to the
 * `where` clause unless `includeDeleted` is passed, so callers never see soft-deleted rows by
 * accident. (Done here rather than as a global Prisma extension so the Better Auth models are
 * unaffected.) Every method accepts an optional `tx` so services can compose atomic writes.
 */
export const candidateRepository = {
  async create(data: Prisma.CandidateUncheckedCreateInput, tx?: Prisma.TransactionClient) {
    return decryptRow(await db(tx).candidate.create({ data: encryptLicense(data) }));
  },

  async findById(id: string, opts?: { includeDeleted?: boolean }, tx?: Prisma.TransactionClient) {
    return decryptRow(
      await db(tx).candidate.findFirst({
        where: { id, ...(opts?.includeDeleted ? {} : { deletedAt: null }) },
      }),
    );
  },

  /**
   * ETL-ONLY, intentionally delete-agnostic: returns a soft-deleted row too, so the one-shot
   * migration re-upserts an existing (even trashed) record instead of creating a duplicate.
   * UI/read paths must NOT use this — they go through `findById`/`list` (which exclude deleted).
   */
  async findByLegacyId(legacyId: string, tx?: Prisma.TransactionClient) {
    return decryptRow(await db(tx).candidate.findUnique({ where: { legacyId } }));
  },

  /** ETL upsert keyed on the legacy Sheet id — idempotent re-runs; delete-agnostic (see above). */
  async upsertByLegacyId(
    legacyId: string,
    create: Prisma.CandidateUncheckedCreateInput,
    update: Prisma.CandidateUncheckedUpdateInput,
    tx?: Prisma.TransactionClient,
  ) {
    return decryptRow(
      await db(tx).candidate.upsert({
        where: { legacyId },
        create: { ...encryptLicense(create), legacyId },
        update: encryptLicense(update),
      }),
    );
  },

  async list(filters: CandidateListFilters = {}, tx?: Prisma.TransactionClient) {
    const where: Prisma.CandidateWhereInput = {};
    if (!filters.includeDeleted) where.deletedAt = null;
    if (filters.status) where.status = filters.status;
    if (filters.track) where.track = filters.track;
    if (filters.clientId) where.clientId = filters.clientId;
    if (filters.tags && filters.tags.length > 0) where.tags = { hasSome: filters.tags };
    if (filters.search) {
      where.OR = [
        { name: { contains: filters.search, mode: "insensitive" } },
        { email: { contains: filters.search, mode: "insensitive" } },
      ];
    }
    const rows = await db(tx).candidate.findMany({
      where,
      orderBy: { createdAt: "desc" },
      ...(filters.take !== undefined ? { take: filters.take } : {}),
    });
    return rows.map(decryptRow);
  },

  /**
   * Per-status counts (`groupBy`) for the dashboard funnel — avoids loading the whole table just to
   * count. Soft-deleted rows are excluded. No PII columns are touched, so no crypto is involved.
   */
  groupByStatus(tx?: Prisma.TransactionClient) {
    return db(tx).candidate.groupBy({
      by: ["status"],
      where: { deletedAt: null },
      _count: { _all: true },
    });
  },

  /**
   * The oldest-in-stage ACTIVE candidates (stageOrder 0..8), capped small — the dashboard's targeted
   * "needs attention" read. Ordered by `stageEnteredAt` asc (longest in stage first) so the service
   * can flag overdue/stuck without scanning the whole table.
   */
  async listStaleActive(limit: number, tx?: Prisma.TransactionClient) {
    const rows = await db(tx).candidate.findMany({
      where: { deletedAt: null, stageOrder: { lt: 9 } },
      orderBy: { stageEnteredAt: "asc" },
      take: limit,
    });
    return rows.map(decryptRow);
  },

  async update(
    id: string,
    data: Prisma.CandidateUncheckedUpdateInput,
    tx?: Prisma.TransactionClient,
  ) {
    return decryptRow(await db(tx).candidate.update({ where: { id }, data: encryptLicense(data) }));
  },

  async softDelete(id: string, actorId: string, tx?: Prisma.TransactionClient) {
    return decryptRow(
      await db(tx).candidate.update({
        where: { id },
        data: { deletedAt: new Date(), deletedById: actorId },
      }),
    );
  },

  async restore(id: string, tx?: Prisma.TransactionClient) {
    return decryptRow(
      await db(tx).candidate.update({
        where: { id },
        data: { deletedAt: null, deletedById: null },
      }),
    );
  },
};
