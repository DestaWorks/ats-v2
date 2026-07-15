import "server-only";
import type { OutreachAttempt, Prisma, SourceLead } from "@/generated/prisma/client";
import { db } from "@/server/db/prisma";

/** A raw source-lead row (Prisma model). Services/DTOs map this to API shapes. */
export type LeadRow = SourceLead;
/** A raw outreach-attempt row (Prisma model). */
export type OutreachRow = OutreachAttempt;
/** The lean projection `listForMatching` selects — see its doc comment. */
export type LeadMatchRow = Pick<
  SourceLead,
  "id" | "name" | "clientId" | "state" | "credential" | "status"
>;

/** Filters for `list`/`count`. Soft-deleted rows are excluded unless `includeDeleted`. */
export interface LeadListFilters {
  /** Equality on the lead status label (a `LeadStatus`). */
  status?: string;
  /** Equality on the sourcing source (free text). */
  source?: string;
  /** Equality on the target client. */
  clientId?: string;
  /** Equality on the owner (`createdById` — who sourced the lead). */
  createdById?: string;
  /** Free-text match on name or email (case-insensitive). */
  search?: string;
  includeDeleted?: boolean;
  /** OFFSET skip for the numbered pager (the service computes `(page-1) * pageSize`). */
  skip?: number;
  /** Cap the rows returned (one offset page). */
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
  if (filters.clientId) where.clientId = filters.clientId;
  if (filters.createdById) where.createdById = filters.createdById;
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
   * The core read. Builds the shared `where` (`buildLeadWhere`), orders `createdAt desc` (id
   * tiebreak), and fetches one OFFSET page (`skip`/`take` — the numbered pager, mirroring the
   * candidates list). Newest-first.
   */
  list(filters: LeadListFilters = {}, tx?: Prisma.TransactionClient) {
    return db(tx).sourceLead.findMany({
      where: buildLeadWhere(filters),
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      ...(filters.skip !== undefined ? { skip: filters.skip } : {}),
      ...(filters.take !== undefined ? { take: filters.take } : {}),
    });
  },

  /** True filtered total for the same `where` as `list` (minus skip/take) — the "Showing N of M". */
  count(filters: LeadListFilters = {}, tx?: Prisma.TransactionClient) {
    return db(tx).sourceLead.count({ where: buildLeadWhere(filters) });
  },

  /**
   * Lean projection for the Open Roles matchers (`RuleLead` scoring only reads these 6 columns) —
   * every non-deleted lead, unbounded (the matchers score the whole active pool, not one page).
   * Skips PII/large columns (email, phone, notes, tags, …) the scorers never touch.
   */
  listForMatching(tx?: Prisma.TransactionClient): Promise<LeadMatchRow[]> {
    return db(tx).sourceLead.findMany({
      where: { deletedAt: null },
      select: { id: true, name: true, clientId: true, state: true, credential: true, status: true },
    });
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
        lastOutreachChannel: params.channel,
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
   * Patch one attempt, scoped to its lead (`updateMany` — an id belonging to another lead is a
   * 0-row no-op, never a cross-lead write). Returns the affected count.
   */
  async updateOutreachAttempt(
    leadId: string,
    attemptId: string,
    data: { channel?: string; note?: string | null; at?: Date },
    tx?: Prisma.TransactionClient,
  ) {
    const { count } = await db(tx).outreachAttempt.updateMany({
      where: { id: attemptId, leadId },
      data,
    });
    return count;
  },

  /** Delete one attempt, scoped to its lead. Returns the affected count. */
  async deleteOutreachAttempt(leadId: string, attemptId: string, tx?: Prisma.TransactionClient) {
    const { count } = await db(tx).outreachAttempt.deleteMany({
      where: { id: attemptId, leadId },
    });
    return count;
  },

  /**
   * Recompute the lead's denormalized outreach columns from the attempts table (after an edit or
   * delete changed the underlying rows). Status is intentionally NOT touched (legacy parity —
   * deleting an attempt never regresses the funnel; that stays a manual status change).
   */
  async syncOutreachDenorm(leadId: string, tx?: Prisma.TransactionClient) {
    const [count, latest] = await Promise.all([
      db(tx).outreachAttempt.count({ where: { leadId } }),
      db(tx).outreachAttempt.findFirst({
        where: { leadId },
        orderBy: [{ at: "desc" }, { id: "desc" }],
        select: { at: true, channel: true },
      }),
    ]);
    return db(tx).sourceLead.update({
      where: { id: leadId },
      data: {
        outreachCount: count,
        lastOutreachAt: latest?.at ?? null,
        lastOutreachChannel: latest?.channel ?? null,
      },
    });
  },

  /** Non-deleted leads matching any of the given ids (bulk actions resolve their working set here). */
  findManyByIds(ids: string[], opts?: { includeDeleted?: boolean }, tx?: Prisma.TransactionClient) {
    return db(tx).sourceLead.findMany({
      where: { id: { in: ids }, ...(opts?.includeDeleted ? {} : { deletedAt: null }) },
    });
  },

  /** Existing (incl. soft-deleted) leads matching any of these lowercased emails — import dedup. */
  findManyByEmails(emails: string[], tx?: Prisma.TransactionClient) {
    if (emails.length === 0) return Promise.resolve([]);
    return db(tx).sourceLead.findMany({
      where: { email: { in: emails, mode: "insensitive" } },
      select: { id: true, email: true, name: true, phone: true },
    });
  },

  /** Existing leads matching any of these names (import dedup fallback for email-less rows). */
  findManyByNames(names: string[], tx?: Prisma.TransactionClient) {
    if (names.length === 0) return Promise.resolve([]);
    return db(tx).sourceLead.findMany({
      where: { name: { in: names, mode: "insensitive" } },
      select: { id: true, email: true, name: true, phone: true },
    });
  },

  /** Bulk insert (import) — rows are pre-deduped by the service. */
  createMany(rows: Prisma.SourceLeadCreateManyInput[], tx?: Prisma.TransactionClient) {
    return db(tx).sourceLead.createMany({ data: rows });
  },

  /**
   * ETL-ONLY, delete-agnostic: returns a soft-deleted row too, so the one-shot migration re-upserts
   * an existing (even trashed) lead instead of duplicating. UI/read paths use `findById`/`list`.
   */
  findByLegacyId(legacyId: string, tx?: Prisma.TransactionClient) {
    return db(tx).sourceLead.findUnique({ where: { legacyId } });
  },

  /**
   * The lead a candidate was promoted FROM (unique back-link), delete-agnostic — the journey
   * still shows the sourcing origin even if the lead row was later trashed.
   */
  findByPromotedCandidateId(candidateId: string, tx?: Prisma.TransactionClient) {
    return db(tx).sourceLead.findUnique({ where: { promotedCandidateId: candidateId } });
  },
};
