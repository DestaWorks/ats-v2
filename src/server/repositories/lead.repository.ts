import "server-only";
import type { OutreachAttempt, Prisma, SourceLead } from "@/generated/prisma/client";
import type { PageCursor } from "@/lib/validation/cursor";
import { prisma } from "@/server/db/prisma";

/** A raw source-lead row (Prisma model). Services/DTOs map this to API shapes. */
export type LeadRow = SourceLead;
/** A raw outreach-attempt row (Prisma model). */
export type OutreachRow = OutreachAttempt;

/** Filters for `list`/`count`. Soft-deleted rows are excluded unless `includeDeleted`. */
export interface LeadListFilters {
  /** Equality on the lead status label (a `LeadStatus`). */
  status?: string;
  /** Equality on the sourcing source (free text). */
  source?: string;
  /** Free-text match on name or email (case-insensitive). */
  search?: string;
  includeDeleted?: boolean;
  /** Keyset cursor — the service decodes it; the repo turns it into a `WHERE (createdAt, id) < cursor`. */
  cursor?: PageCursor;
  /** Cap the rows returned (callers pass `pageSize + 1` to detect `hasMore`). */
  take?: number;
}

/** The denormalized patch + computed next status a `logOutreach` write applies to the lead. */
export interface LogOutreachParams {
  leadId: string;
  channel: string;
  note?: string | null;
  at: Date;
  actorId: string;
  /** The next status computed by the pure `advanceOnOutreach` (may equal the current one). */
  status: string;
}

/**
 * Build the shared `where` for a lead read. Everything AND-combines: the OR-bearing `search`
 * predicate goes into an `AND: [...]` array so it never clobbers the keyset OR (same shape as
 * `buildCandidateWhere`). Soft-deleted rows are excluded unless `includeDeleted`.
 */
export function buildLeadWhere(filters: LeadListFilters): Prisma.SourceLeadWhereInput {
  const where: Prisma.SourceLeadWhereInput = {};
  const and: Prisma.SourceLeadWhereInput[] = [];
  if (!filters.includeDeleted) where.deletedAt = null;
  if (filters.status) where.status = filters.status;
  if (filters.source) where.source = filters.source;
  if (filters.search) {
    and.push({
      OR: [
        { name: { contains: filters.search, mode: "insensitive" } },
        { email: { contains: filters.search, mode: "insensitive" } },
      ],
    });
  }
  if (and.length > 0) where.AND = and;
  return where;
}

/** The keyset predicate `WHERE (createdAt, id) < cursor` — Newest-first (`createdAt desc`, id tiebreak). */
function keysetWhere(cursor: PageCursor): Prisma.SourceLeadWhereInput {
  const dt = new Date(cursor.value);
  return { OR: [{ createdAt: { lt: dt } }, { createdAt: dt, id: { lt: cursor.id } }] };
}

/** Merge an extra AND clause into a where, normalizing `AND` to an array. */
function andMerge(
  where: Prisma.SourceLeadWhereInput,
  clause: Prisma.SourceLeadWhereInput,
): Prisma.SourceLeadWhereInput {
  const existing = where.AND;
  const arr = Array.isArray(existing) ? existing : existing ? [existing] : [];
  return { ...where, AND: [...arr, clause] };
}

/** Resolve the client to use — the transaction client when composing writes, else the singleton. */
function db(tx?: Prisma.TransactionClient) {
  return tx ?? prisma;
}

/**
 * Source-lead + outreach-attempt data access — the ONLY layer that touches Prisma for leads.
 *
 * SOFT DELETE: this repository is the enforcement point (mirrors `candidateRepository`). Reads add
 * `deletedAt: null` unless `includeDeleted`, so callers never see soft-deleted leads by accident.
 * Every method accepts an optional `tx` so the service can compose atomic writes (attempt + denorm +
 * audit; candidate-create + lead flip). Leads carry no encrypted columns → no field crypto here.
 */
export const leadRepository = {
  create(data: Prisma.SourceLeadUncheckedCreateInput, tx?: Prisma.TransactionClient) {
    return db(tx).sourceLead.create({ data });
  },

  findById(id: string, opts?: { includeDeleted?: boolean }, tx?: Prisma.TransactionClient) {
    return db(tx).sourceLead.findFirst({
      where: { id, ...(opts?.includeDeleted ? {} : { deletedAt: null }) },
    });
  },

  /**
   * The core read. Builds the shared `where` (`buildLeadWhere`), applies the keyset predicate from
   * `cursor`, orders `createdAt desc` (id tiebreak), and fetches `take` rows (callers pass
   * `pageSize + 1` so the service can detect `hasMore` + derive `nextCursor`). Newest-first.
   */
  list(filters: LeadListFilters = {}, tx?: Prisma.TransactionClient) {
    let where = buildLeadWhere(filters);
    if (filters.cursor) where = andMerge(where, keysetWhere(filters.cursor));
    return db(tx).sourceLead.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      ...(filters.take !== undefined ? { take: filters.take } : {}),
    });
  },

  /** True filtered total for the same `where` as `list` (minus cursor/take) — the "Showing N of M". */
  count(filters: LeadListFilters = {}, tx?: Prisma.TransactionClient) {
    return db(tx).sourceLead.count({ where: buildLeadWhere(filters) });
  },

  /** Patch a lead — status / respondedAt / promote back-link / denorm columns. */
  update(id: string, data: Prisma.SourceLeadUncheckedUpdateInput, tx?: Prisma.TransactionClient) {
    return db(tx).sourceLead.update({ where: { id }, data });
  },

  /**
   * Atomically flip a lead to `Promoted` ONLY if it isn't already (and isn't soft-deleted). Returns
   * the number of rows updated (1 = we won the race, 0 = a concurrent promote beat us). This is the
   * DB-level guard against a TOCTOU double-promote — the `canPromote` check happens outside the tx.
   */
  async markPromoted(id: string, candidateId: string, tx?: Prisma.TransactionClient) {
    const { count } = await db(tx).sourceLead.updateMany({
      where: { id, status: { not: "Promoted" }, deletedAt: null },
      data: { status: "Promoted", promotedCandidateId: candidateId },
    });
    return count;
  },

  softDelete(id: string, actorId: string, tx?: Prisma.TransactionClient) {
    return db(tx).sourceLead.update({
      where: { id },
      data: { deletedAt: new Date(), deletedById: actorId },
    });
  },

  /** Clear the soft-delete markers — the lead returns exactly as it was (status untouched). */
  restore(id: string, tx?: Prisma.TransactionClient) {
    return db(tx).sourceLead.update({
      where: { id },
      data: { deletedAt: null, deletedById: null },
    });
  },

  /**
   * Log one outreach attempt: insert the `OutreachAttempt` row AND apply the lead's denormalized
   * outreach columns (the computed next `status`, `outreachCount +1`, `lastOutreachAt`) in the same
   * `tx`. The `status` is passed IN (computed by the pure `advanceOnOutreach` in the service) — the
   * repo never runs domain rules. Returns both the new attempt and the updated lead.
   */
  async logOutreach(params: LogOutreachParams, tx?: Prisma.TransactionClient) {
    const client = db(tx);
    const attempt = await client.outreachAttempt.create({
      data: {
        leadId: params.leadId,
        channel: params.channel,
        note: params.note ?? null,
        at: params.at,
        actorId: params.actorId,
      },
    });
    const lead = await client.sourceLead.update({
      where: { id: params.leadId },
      data: {
        status: params.status,
        outreachCount: { increment: 1 },
        lastOutreachAt: params.at,
      },
    });
    return { attempt, lead };
  },

  /** A lead's outreach attempts, newest-first (the detail log). */
  listOutreach(leadId: string, tx?: Prisma.TransactionClient) {
    return db(tx).outreachAttempt.findMany({
      where: { leadId },
      orderBy: { at: "desc" },
    });
  },

  /**
   * ETL-ONLY, delete-agnostic: returns a soft-deleted row too, so the one-shot migration re-upserts
   * an existing (even trashed) lead instead of duplicating. UI/read paths use `findById`/`list`.
   */
  findByLegacyId(legacyId: string, tx?: Prisma.TransactionClient) {
    return db(tx).sourceLead.findUnique({ where: { legacyId } });
  },
};
