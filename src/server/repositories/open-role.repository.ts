import "server-only";
import type { OpenRole, Prisma } from "@/generated/prisma/client";
import { db } from "@/server/db/prisma";

/** A raw open-role row (Prisma model). Services/DTOs map this to API shapes. */
export type OpenRoleRow = OpenRole;

/** Filters for the roles list/count. Roles are hard-deleted (legacy parity) — no `deletedAt` filter. */
export interface OpenRoleFilters {
  clientId?: string;
  status?: string;
  priority?: string;
  /** Free-text match on title (case-insensitive). */
  search?: string;
}

function buildWhere(filters: OpenRoleFilters): Prisma.OpenRoleWhereInput {
  return {
    ...(filters.clientId ? { clientId: filters.clientId } : {}),
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.priority ? { priority: filters.priority } : {}),
    ...(filters.search ? { title: { contains: filters.search, mode: "insensitive" } } : {}),
  };
}

/**
 * Open-role data access (Wave 3.5) — the ONLY layer that touches Prisma for roles/role-notes.
 * Roles are HARD-deleted (legacy `open_role_delete` has no undo) — no soft-delete filter anywhere
 * here, unlike candidates/leads. Every method accepts an optional `tx` so the service can compose
 * the write + `writeAudit` atomically.
 */
export const openRoleRepository = {
  create(data: Prisma.OpenRoleUncheckedCreateInput, tx?: Prisma.TransactionClient) {
    return db(tx).openRole.create({ data });
  },

  findById(id: string, tx?: Prisma.TransactionClient) {
    return db(tx).openRole.findUnique({ where: { id } });
  },

  /** Batch-fetch by ids (unordered) — for building `roleId → row` maps in the triage/matches reads. */
  findManyByIds(ids: string[], tx?: Prisma.TransactionClient) {
    if (ids.length === 0) return Promise.resolve([]);
    return db(tx).openRole.findMany({ where: { id: { in: [...new Set(ids)] } } });
  },

  count(filters: OpenRoleFilters = {}, tx?: Prisma.TransactionClient) {
    return db(tx).openRole.count({ where: buildWhere(filters) });
  },

  list(
    filters: OpenRoleFilters & { skip?: number; take?: number } = {},
    tx?: Prisma.TransactionClient,
  ) {
    return db(tx).openRole.findMany({
      where: buildWhere(filters),
      orderBy: { createdAt: "desc" },
      skip: filters.skip,
      take: filters.take,
    });
  },

  /** All non-terminal (Open/On Hold) roles — the triage strip's candidate pool. */
  listActive(tx?: Prisma.TransactionClient) {
    return db(tx).openRole.findMany({
      where: { status: { notIn: ["Filled", "Closed"] } },
      orderBy: { openedAt: "asc" },
    });
  },

  update(id: string, data: Prisma.OpenRoleUncheckedUpdateInput, tx?: Prisma.TransactionClient) {
    return db(tx).openRole.update({ where: { id }, data });
  },

  /** Hard delete (legacy parity — no soft-delete/undo for roles). */
  delete(id: string, tx?: Prisma.TransactionClient) {
    return db(tx).openRole.delete({ where: { id } });
  },

  // --- role notes ---

  createNote(
    data: {
      roleId: string;
      authorId: string;
      authorName: string | null;
      body: string;
      category: string;
    },
    tx?: Prisma.TransactionClient,
  ) {
    return db(tx).roleNote.create({ data });
  },

  listNotes(roleId: string, tx?: Prisma.TransactionClient) {
    return db(tx).roleNote.findMany({
      where: { roleId, deletedAt: null },
      orderBy: { createdAt: "desc" },
    });
  },

  softDeleteNote(id: string, actorId: string, tx?: Prisma.TransactionClient) {
    return db(tx).roleNote.updateMany({
      where: { id, deletedAt: null },
      data: { deletedAt: new Date(), deletedById: actorId },
    });
  },
};
