import "server-only";
import type { Candidate, Prisma } from "@/generated/prisma/client";
import {
  ACTIVE_STATUS_CODES,
  statusSlaDays,
  type CandidateStatus,
  type LicenseStatus,
  type Track,
} from "@/lib/constants";
import type { ListOrderBy, PageCursor } from "@/lib/validation/cursor";
import { prisma } from "@/server/db/prisma";
import { decryptField, encryptField } from "@/server/db/field-crypto";

/** A raw candidate row (Prisma model). Services/DTOs map this to API shapes. */
export type CandidateRow = Candidate;

/** In-stage threshold (days) that marks a candidate "stuck" — mirrors the `isStuck` default. */
export const STUCK_DAYS = 7;
/** Terminal stages start at order 9; "stuck" only applies to active stages (order < 9). */
const FIRST_TERMINAL_ORDER = 9;
const MS_PER_DAY = 86_400_000;

/** Filters for `list`/`count`/`groupByStatusFiltered`. Soft-deleted rows are excluded unless `includeDeleted`. */
export interface CandidateListFilters {
  status?: CandidateStatus;
  track?: Track;
  clientId?: string;
  /** Free-text match on name or email (case-insensitive). */
  search?: string;
  /** Match candidates carrying any of these tags. */
  tags?: string[];
  /** Equality on the license verification status. */
  licenseStatus?: LicenseStatus;
  /** "My candidates" — the service resolves this from `viewer.id` (never a client-supplied id). */
  createdById?: string;
  /** In-stage > `STUCK_DAYS` and still active (order < 9). Threshold predicate (§3.1). */
  stuck?: boolean;
  /** Past the per-stage SLA — an OR over the active stages that have one (§3.2). */
  overdue?: boolean;
  includeDeleted?: boolean;
  /** Keyset cursor — the service decodes it; the repo turns it into a `WHERE (sortkey, id) ≷ cursor`. */
  cursor?: PageCursor;
  /** Sort order + keyset direction (default `createdAt_desc`). */
  orderBy?: ListOrderBy;
  /** Cap the number of rows returned (callers pass `pageSize + 1` to detect `hasMore`). */
  take?: number;
  /** "Now" for the `stuck`/`overdue` thresholds — the service passes one clock per request. */
  now?: Date;
}

/**
 * DB-expressible `overdue` predicate — an OR over the active stages that carry an SLA
 * (`STARTED_DAY1` + all terminals have `slaDays: null` → never overdue). Exact against
 * `isOverdue`'s `stageEnteredAt < now - slaDays*24h` boundary (OQ-2: agrees to sub-hour tolerance).
 */
export function overdueWhere(now: Date): Prisma.CandidateWhereInput {
  const clauses = ACTIVE_STATUS_CODES.map((status) => ({ status, sla: statusSlaDays(status) }))
    .filter((s): s is { status: CandidateStatus; sla: number } => s.sla !== null)
    .map(({ status, sla }) => ({
      status,
      stageEnteredAt: { lt: new Date(now.getTime() - sla * MS_PER_DAY) },
    }));
  return { OR: clauses };
}

/** DB-expressible `stuck` predicate — in-stage > `STUCK_DAYS` AND still active (order < 9). */
export function stuckWhere(now: Date): Prisma.CandidateWhereInput {
  return {
    stageEnteredAt: { lt: new Date(now.getTime() - STUCK_DAYS * MS_PER_DAY) },
    stageOrder: { lt: FIRST_TERMINAL_ORDER },
  };
}

/**
 * Build the shared `where` for a candidate read from the filter set. Everything AND-combines
 * (OQ-3): the OR-bearing predicates (`search`, `overdue`) go into an `AND: [...]` array so they
 * never clobber each other or a keyset OR. Soft-deleted rows are excluded unless `includeDeleted`.
 */
export function buildCandidateWhere(
  filters: CandidateListFilters,
  now: Date,
): Prisma.CandidateWhereInput {
  const where: Prisma.CandidateWhereInput = {};
  const and: Prisma.CandidateWhereInput[] = [];
  if (!filters.includeDeleted) where.deletedAt = null;
  if (filters.status) where.status = filters.status;
  if (filters.track) where.track = filters.track;
  if (filters.clientId) where.clientId = filters.clientId;
  if (filters.licenseStatus) where.licenseStatus = filters.licenseStatus;
  if (filters.createdById) where.createdById = filters.createdById;
  if (filters.tags && filters.tags.length > 0) where.tags = { hasSome: filters.tags };
  if (filters.search) {
    and.push({
      OR: [
        { name: { contains: filters.search, mode: "insensitive" } },
        { email: { contains: filters.search, mode: "insensitive" } },
      ],
    });
  }
  if (filters.stuck) and.push(stuckWhere(now));
  if (filters.overdue) and.push(overdueWhere(now));
  if (and.length > 0) where.AND = and;
  return where;
}

/** The `[sortKey, id]` orderBy tuple for a sort order (id breaks ties deterministically). */
function orderByClause(orderBy: ListOrderBy): Prisma.CandidateOrderByWithRelationInput[] {
  switch (orderBy) {
    case "createdAt_asc":
      return [{ createdAt: "asc" }, { id: "asc" }];
    case "name_asc":
      return [{ name: "asc" }, { id: "asc" }];
    case "createdAt_desc":
    default:
      return [{ createdAt: "desc" }, { id: "desc" }];
  }
}

/** The keyset predicate `WHERE (sortkey, id) ≷ cursor` for the sort direction. */
function keysetWhere(cursor: PageCursor, orderBy: ListOrderBy): Prisma.CandidateWhereInput {
  if (orderBy === "name_asc") {
    return {
      OR: [{ name: { gt: cursor.value } }, { name: cursor.value, id: { gt: cursor.id } }],
    };
  }
  const dt = new Date(cursor.value);
  if (orderBy === "createdAt_asc") {
    return { OR: [{ createdAt: { gt: dt } }, { createdAt: dt, id: { gt: cursor.id } }] };
  }
  return { OR: [{ createdAt: { lt: dt } }, { createdAt: dt, id: { lt: cursor.id } }] };
}

/** Merge an extra AND clause into a where, normalizing `AND` to an array. */
function andMerge(
  where: Prisma.CandidateWhereInput,
  clause: Prisma.CandidateWhereInput,
): Prisma.CandidateWhereInput {
  const existing = where.AND;
  const arr = Array.isArray(existing) ? existing : existing ? [existing] : [];
  return { ...where, AND: [...arr, clause] };
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
   * Batch-resolve candidate ids → `{ id, name, deletedAt }` in ONE query (mirrors
   * `userRepository.namesByIds`) — for LABELING an id (e.g. the Activity Log's `entity=candidate`
   * rows) without loading full rows. De-dupes; short-circuits on an empty set. `includeDeleted`
   * bypasses the soft-delete filter so a SINCE-deleted candidate still labels (its `deletedAt`
   * lets the caller suppress the link). `name` is not an encrypted column — no `decryptRow` needed.
   */
  async namesByIds(
    ids: string[],
    opts?: { includeDeleted?: boolean },
    tx?: Prisma.TransactionClient,
  ): Promise<Map<string, { id: string; name: string; deletedAt: Date | null }>> {
    const unique = [...new Set(ids)];
    if (unique.length === 0) return new Map();
    const rows = await db(tx).candidate.findMany({
      where: { id: { in: unique }, ...(opts?.includeDeleted ? {} : { deletedAt: null }) },
      select: { id: true, name: true, deletedAt: true },
    });
    return new Map(rows.map((r) => [r.id, r] as const));
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

  /**
   * The core read. Builds the shared `where` (`buildCandidateWhere`), applies the keyset predicate
   * from `cursor` and the `[sortKey, id]` `orderBy` tuple, and fetches `take` rows (callers pass
   * `pageSize + 1` so the service can detect `hasMore` + derive `nextCursor`). Returns decrypted
   * rows (unchanged crypto path). Sort defaults to `createdAt_desc` (Newest first).
   */
  async list(filters: CandidateListFilters = {}, tx?: Prisma.TransactionClient) {
    const now = filters.now ?? new Date();
    const orderBy = filters.orderBy ?? "createdAt_desc";
    let where = buildCandidateWhere(filters, now);
    if (filters.cursor) where = andMerge(where, keysetWhere(filters.cursor, orderBy));
    const rows = await db(tx).candidate.findMany({
      where,
      orderBy: orderByClause(orderBy),
      ...(filters.take !== undefined ? { take: filters.take } : {}),
    });
    return rows.map(decryptRow);
  },

  /**
   * True filtered total for the same `where` as `list` (minus cursor/orderBy/take) — the list's
   * `total` denominator and the board's per-status count fallback. No PII columns → no crypto.
   */
  count(filters: CandidateListFilters = {}, tx?: Prisma.TransactionClient) {
    const now = filters.now ?? new Date();
    return db(tx).candidate.count({ where: buildCandidateWhere(filters, now) });
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
   * Per-status counts with the shared (non-status) board filters applied — the board's TRUE
   * per-column totals in ONE query. `status` is intentionally dropped (the board groups ACROSS
   * statuses); every other filter (track/client/search/tags/licenseStatus/mine/overdue/stuck) counts.
   */
  groupByStatusFiltered(filters: CandidateListFilters = {}, tx?: Prisma.TransactionClient) {
    const now = filters.now ?? new Date();
    // Drop `status` — the board groups ACROSS statuses; every other filter still counts.
    return db(tx).candidate.groupBy({
      by: ["status"],
      where: buildCandidateWhere({ ...filters, status: undefined }, now),
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

  /**
   * PERMANENT hard delete — cascades to documents, notes, and stage history (all `onDelete: Cascade`
   * to `Candidate`). Irreversible; ONLY the capability-gated purge service path reaches this. No
   * crypto (the row is being destroyed, not read). The `activity_log` has no FK to `Candidate`, so
   * a purge audit row written in the same transaction survives the cascade.
   */
  async purge(id: string, tx?: Prisma.TransactionClient) {
    return db(tx).candidate.delete({ where: { id } });
  },

  /**
   * The Trash read: ONLY soft-deleted rows (`deletedAt != null`), newest-deleted first. A dedicated
   * method rather than a `list`/`buildCandidateWhere` filter — Trash sorts by `deletedAt desc` (not
   * the keyset createdAt/name machinery) and the set is small, so there is no cursor pagination in
   * v1. `take` caps a runaway trash. Returns decrypted rows (services then PII-gate via `toCandidateDTO`).
   */
  async listDeleted(take?: number, tx?: Prisma.TransactionClient) {
    const rows = await db(tx).candidate.findMany({
      where: { deletedAt: { not: null } },
      orderBy: { deletedAt: "desc" },
      ...(take !== undefined ? { take } : {}),
    });
    return rows.map(decryptRow);
  },
};
