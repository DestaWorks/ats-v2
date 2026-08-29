import { dbUnscoped, type AnyTx } from "../tenant-scope";

/**
 * Data access for `Membership` and `Tenant` — the two GLOBAL models of the tenancy plane
 * (SAAS-RESTRUCTURE-PLAN 6.5).
 *
 * ── Why this sits beside `src/repositories/`, not inside it ─────────────────────────────────────
 *
 * Everything in `src/repositories/` is tenant-scoped and, from 6.3 onward, takes a `TenantContext`
 * as its first argument so that scoping cannot be forgotten. These methods cannot: they are what
 * PRODUCES the context. `findActiveByUserAndSlug` is called before any tenant is known — it is the
 * query that decides which tenant the request is even allowed to be in — so demanding a context
 * would be circular.
 *
 * `Tenant` and `Membership` are therefore in the enforcement seam's `GLOBAL_MODELS` allowlist
 * (`../tenant-scope.ts`), which is the same statement from the other direction: a query that
 * filtered memberships by the active tenant could never answer "which tenants may this user switch
 * to". Keeping them in their own directory makes the exception visible instead of leaving one
 * unscoped file to be mistaken for an oversight in a directory where scoping is mandatory.
 *
 * ── What "unscoped" does and does not mean here ─────────────────────────────────────────────────
 *
 * Every read below is keyed by `userId`, a `tenantId` the caller has already verified, or both.
 * There is no method that lists memberships across tenants for anyone other than the subject user.
 * Cross-tenant reach belongs to the platform plane (6.8) and is audited there, never here.
 */

/** Columns of the joined tenant a resolution needs; nothing about the tenant's contents. */
const TENANT_SELECT = {
  id: true,
  slug: true,
  name: true,
  status: true,
  deletedAt: true,
} as const;

const MEMBERSHIP_SELECT = {
  id: true,
  tenantId: true,
  userId: true,
  role: true,
  status: true,
  invitedById: true,
  createdAt: true,
  tenant: { select: TENANT_SELECT },
} as const;

/** The tenant facts a membership row carries. `status`/`role` stay raw strings — the vocabulary
 *  that validates them lives in `domain`, which `db` may not reach into for a decision. */
export interface MembershipTenantRow {
  id: string;
  slug: string;
  name: string;
  status: string;
  deletedAt: Date | null;
}

/** One membership, joined to its tenant. The shape every tenancy read returns. */
export interface MembershipRow {
  id: string;
  tenantId: string;
  userId: string;
  role: string;
  status: string;
  invitedById: string | null;
  createdAt: Date;
  tenant: MembershipTenantRow;
}

export const membershipRepository = {
  /**
   * The membership a tenant CLAIM has to match: this user, this tenant slug, whatever its status.
   *
   * It deliberately does not filter on `status`, even though only `active` grants access. The
   * caller needs to tell "you were invited but have not accepted" and "your access was removed"
   * apart from "no such membership" — three different answers for the user, one query.
   */
  findByUserAndSlug(userId: string, slug: string, tx?: AnyTx): Promise<MembershipRow | null> {
    return dbUnscoped(tx).membership.findFirst({
      where: { userId, tenant: { slug } },
      select: MEMBERSHIP_SELECT,
    });
  },

  /** The same row by tenant id — what an invitation checks before it creates or revives one. */
  findByTenantAndUser(tenantId: string, userId: string, tx?: AnyTx): Promise<MembershipRow | null> {
    return dbUnscoped(tx).membership.findUnique({
      where: { tenantId_userId: { tenantId, userId } },
      select: MEMBERSHIP_SELECT,
    });
  },

  /** Every membership this user holds, in any status — the tenant switcher and its pending
   *  invitations, in one read. Ordered by tenant name so the switcher is stable. */
  listByUser(userId: string, tx?: AnyTx): Promise<MembershipRow[]> {
    return dbUnscoped(tx).membership.findMany({
      where: { userId },
      select: MEMBERSHIP_SELECT,
      orderBy: { tenant: { name: "asc" } },
    });
  },

  /** One membership by id, constrained to a tenant the caller has already been verified in.
   *  The `tenantId` is part of the predicate, not an assertion after the fact. */
  findByIdInTenant(
    tenantId: string,
    membershipId: string,
    tx?: AnyTx,
  ): Promise<MembershipRow | null> {
    return dbUnscoped(tx).membership.findFirst({
      where: { id: membershipId, tenantId },
      select: MEMBERSHIP_SELECT,
    });
  },

  /** This tenant's roster. Ordered oldest-first so the founding members read first. */
  listByTenant(tenantId: string, tx?: AnyTx): Promise<MembershipRow[]> {
    return dbUnscoped(tx).membership.findMany({
      where: { tenantId },
      select: MEMBERSHIP_SELECT,
      orderBy: { createdAt: "asc" },
    });
  },

  /** How many members currently hold a given role in a tenant — the last-administrator check. */
  countActiveByRole(tenantId: string, roles: readonly string[], tx?: AnyTx): Promise<number> {
    return dbUnscoped(tx).membership.count({
      where: { tenantId, status: "active", role: { in: [...roles] } },
    });
  },

  /**
   * Active member counts for several tenants at once, as `Map<tenantId, count>`.
   *
   * One query rather than a count per tenant, because the only caller is the platform plane's
   * tenant list and an N+1 there would grow with the customer base. Tenants with no active member
   * are absent from the map; the caller defaults them to zero.
   */
  async countActiveByTenantIds(
    tenantIds: readonly string[],
    tx?: AnyTx,
  ): Promise<Map<string, number>> {
    if (tenantIds.length === 0) return new Map();
    const rows = await dbUnscoped(tx).membership.findMany({
      where: { tenantId: { in: [...tenantIds] }, status: "active" },
      select: { tenantId: true },
    });
    const counts = new Map<string, number>();
    for (const row of rows) counts.set(row.tenantId, (counts.get(row.tenantId) ?? 0) + 1);
    return counts;
  },

  /**
   * Create an invitation, or re-invite someone previously removed.
   *
   * An upsert rather than a create because `@@unique([tenantId, userId])` means a removed member
   * still occupies the row: re-inviting them has to revive it, not collide with it. The update
   * branch is narrow on purpose — it never touches an `active` row's role (that would be a silent
   * privilege change dressed up as an invitation), which the service enforces before calling.
   */
  upsertInvitation(
    input: {
      tenantId: string;
      userId: string;
      role: string;
      invitedById: string;
    },
    tx?: AnyTx,
  ): Promise<MembershipRow> {
    return dbUnscoped(tx).membership.upsert({
      where: { tenantId_userId: { tenantId: input.tenantId, userId: input.userId } },
      create: {
        tenantId: input.tenantId,
        userId: input.userId,
        role: input.role,
        status: "invited",
        invitedById: input.invitedById,
      },
      update: { role: input.role, status: "invited", invitedById: input.invitedById },
      select: MEMBERSHIP_SELECT,
    });
  },

  /** Move a membership between lifecycle states. The only write that changes access. */
  updateStatus(membershipId: string, status: string, tx?: AnyTx): Promise<MembershipRow> {
    return dbUnscoped(tx).membership.update({
      where: { id: membershipId },
      data: { status },
      select: MEMBERSHIP_SELECT,
    });
  },
};

export const tenantRepository = {
  /** One tenant by slug, live rows only. Feeds invitation and platform reads, never a data query. */
  findBySlug(slug: string, tx?: AnyTx): Promise<MembershipTenantRow | null> {
    return dbUnscoped(tx).tenant.findFirst({
      where: { slug, deletedAt: null },
      select: TENANT_SELECT,
    });
  },

  /** One tenant by id, live rows only. */
  findById(id: string, tx?: AnyTx): Promise<MembershipTenantRow | null> {
    return dbUnscoped(tx).tenant.findFirst({
      where: { id, deletedAt: null },
      select: TENANT_SELECT,
    });
  },

  /**
   * Every live tenant on the installation.
   *
   * The only genuinely cross-tenant read in this file, and it returns operational metadata only —
   * no candidates, no clients, nothing a tenant would consider its own. It is reachable exclusively
   * from the platform plane, whose guard is `packages/auth/src/platform-admin.ts`.
   */
  listAll(tx?: AnyTx): Promise<MembershipTenantRow[]> {
    return dbUnscoped(tx).tenant.findMany({
      where: { deletedAt: null },
      select: TENANT_SELECT,
      orderBy: { name: "asc" },
    });
  },
};
