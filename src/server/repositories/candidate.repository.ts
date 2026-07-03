import "server-only";
import type { Candidate, Prisma } from "@/generated/prisma/client";
import type { CandidateStatus, Track } from "@/lib/constants";
import { prisma } from "@/server/db/prisma";

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
}

/** Resolve the client to use — the transaction client when composing writes, else the singleton. */
function db(tx?: Prisma.TransactionClient) {
  return tx ?? prisma;
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
  create(data: Prisma.CandidateUncheckedCreateInput, tx?: Prisma.TransactionClient) {
    return db(tx).candidate.create({ data });
  },

  findById(id: string, opts?: { includeDeleted?: boolean }, tx?: Prisma.TransactionClient) {
    return db(tx).candidate.findFirst({
      where: { id, ...(opts?.includeDeleted ? {} : { deletedAt: null }) },
    });
  },

  /**
   * ETL-ONLY, intentionally delete-agnostic: returns a soft-deleted row too, so the one-shot
   * migration re-upserts an existing (even trashed) record instead of creating a duplicate.
   * UI/read paths must NOT use this — they go through `findById`/`list` (which exclude deleted).
   */
  findByLegacyId(legacyId: string, tx?: Prisma.TransactionClient) {
    return db(tx).candidate.findUnique({ where: { legacyId } });
  },

  /** ETL upsert keyed on the legacy Sheet id — idempotent re-runs; delete-agnostic (see above). */
  upsertByLegacyId(
    legacyId: string,
    create: Prisma.CandidateUncheckedCreateInput,
    update: Prisma.CandidateUncheckedUpdateInput,
    tx?: Prisma.TransactionClient,
  ) {
    return db(tx).candidate.upsert({
      where: { legacyId },
      create: { ...create, legacyId },
      update,
    });
  },

  list(filters: CandidateListFilters = {}, tx?: Prisma.TransactionClient) {
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
    return db(tx).candidate.findMany({ where, orderBy: { createdAt: "desc" } });
  },

  update(id: string, data: Prisma.CandidateUncheckedUpdateInput, tx?: Prisma.TransactionClient) {
    return db(tx).candidate.update({ where: { id }, data });
  },

  softDelete(id: string, actorId: string, tx?: Prisma.TransactionClient) {
    return db(tx).candidate.update({
      where: { id },
      data: { deletedAt: new Date(), deletedById: actorId },
    });
  },

  restore(id: string, tx?: Prisma.TransactionClient) {
    return db(tx).candidate.update({
      where: { id },
      data: { deletedAt: null, deletedById: null },
    });
  },
};
