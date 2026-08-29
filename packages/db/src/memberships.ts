import {
  membershipRepository,
  type MembershipRow as TenancyMembershipRow,
} from "./tenancy/membership.repository";

/**
 * The membership row tenant RESOLUTION sees — richer than the one the switcher lists, because it
 * carries `status` and the tenant's own state. Those are what let a denial say *why* (invited,
 * removed, suspended) instead of collapsing every case into "no".
 */
export type ResolverMembershipRow = TenancyMembershipRow;
import { dbUnscoped } from "./tenant-scope";

/**
 * Reading the memberships a user holds — the query that PRODUCES a tenant scope, and therefore
 * the one query that cannot be subject to one.
 *
 * It lives beside the seam rather than in `repositories/` on purpose. Every module in there is
 * being given a `TenantContext` first argument so a tenant-scoped read cannot be written without
 * one; this read is the opposite shape. `Membership` and `Tenant` are in the seam's
 * `GLOBAL_MODELS` allowlist precisely because a membership query filtered by the active tenant
 * could never answer "which tenants may this user act in", which is the question asked here,
 * before any tenant is active. Filing it under the scoped repositories would make it the standing
 * exception to their rule; keeping it here means that rule has none.
 *
 * `dbUnscoped` is therefore correct here, not debt: this is one of the few call sites that will
 * still be using it when the ratchet in `scripts/check-tenant-scope.mjs` reaches its floor.
 */

/** One tenant a user may act in, flattened to exactly what a guard needs to build a context. */
export interface MembershipRow {
  readonly id: string;
  readonly tenantId: string;
  readonly tenantSlug: string;
  readonly tenantName: string;
  /** The raw stored value. Callers narrow it with `toRole` — never trusted verbatim. */
  readonly role: string;
}

export const membershipReader = {
  /**
   * The two reads tenant RESOLUTION needs, delegated to the tenancy repository.
   *
   * They hang off this object rather than being imported from the repository directly so that auth
   * has ONE membership read surface: 131 route and controller suites already substitute this
   * module, and a resolver reading around it would run against a double that never intercepts.
   *
   * `listAllForUser` deliberately does NOT filter, unlike `listActiveForUser` below — the resolver
   * has to tell an `invited` membership from a `removed` one from none at all, and a pre-filtered
   * list collapses all three into "denied" with no reason to report.
   */
  findByUserAndSlug: (userId: string, slug: string) =>
    membershipRepository.findByUserAndSlug(userId, slug),
  listAllForUser: (userId: string) => membershipRepository.listByUser(userId),

  /**
   * Every tenant the user can currently act in, oldest membership first.
   *
   * Filters on both sides of the join. `status: "active"` drops memberships that are still
   * `invited` (accepted in Phase 6.5) or `removed`; a suspended or soft-deleted tenant drops out
   * even for members, so suspending a tenant is one row's edit rather than a hunt through its
   * memberships. A trial tenant is a paying-status question, not an access one, so it stays.
   */
  async listActiveForUser(userId: string): Promise<MembershipRow[]> {
    const rows = await dbUnscoped().membership.findMany({
      where: {
        userId,
        status: "active",
        tenant: { deletedAt: null, status: { not: "suspended" } },
      },
      select: {
        id: true,
        tenantId: true,
        role: true,
        tenant: { select: { slug: true, name: true } },
      },
      orderBy: { createdAt: "asc" },
    });
    return rows.map((row) => ({
      id: row.id,
      tenantId: row.tenantId,
      tenantSlug: row.tenant.slug,
      tenantName: row.tenant.name,
      role: row.role,
    }));
  },
};

/**
 * The two reads tenant resolution needs, delegated to the tenancy repository.
 *
 * They live on this object rather than being imported from `tenancy/membership.repository`
 * directly so that auth has ONE membership read surface: 131 route and controller suites already
 * substitute this module, and a resolver reading around it would be tested against a double that
 * never intercepts. `listAllForUser` deliberately does NOT filter — the resolver needs to tell an
 * `invited` membership from a `removed` one from none at all, and a pre-filtered list collapses
 * all three into "denied" with no reason to report.
 */
