import type { MembershipRow, ResolverMembershipRow } from "@destaworks/db/memberships";

/** The minimum of a Better Auth session these doubles read: who, and with what stored role. */
interface SessionLike {
  user?: { role?: string | undefined } | undefined;
}

/**
 * The `membershipReader` double for a route or controller test — ONE active membership, in one
 * tenant, carrying the role the mocked session was signed in with.
 *
 * Those tests mock the session and then run the real guard chain, because what they assert is the
 * 401/403 decision. Moving `role` onto the membership put a second read on that path, so they need
 * a membership too; this keeps the thing they vary a single value (the session's role) instead of
 * a second fixture to hold consistent with the first.
 *
 * The role is passed through verbatim, including a forged or absent one — the guard's own
 * `toRole` is what must collapse those to the least privileged role, and a double that tidied
 * them up first would hide exactly the case those tests exist to prove.
 *
 * Multi-tenant behaviour is deliberately NOT expressible here: a test that cares which tenant it
 * is in is testing resolution itself and should stub the reader directly, so that the shape of
 * this default cannot quietly become the definition of correct.
 */
export function singleTenantMembershipReader(
  session: () => SessionLike | null,
  tenantId = "t1",
): {
  listActiveForUser: (userId: string) => Promise<MembershipRow[]>;
  listAllForUser: (userId: string) => Promise<ResolverMembershipRow[]>;
  findByUserAndSlug: (userId: string, slug: string) => Promise<ResolverMembershipRow | null>;
} {
  /**
   * The resolver reads a richer row than the switcher lists — it needs `status` and the tenant's
   * own state to say WHY access was denied. The single membership this double describes is always
   * active in a live tenant; a suite testing a denial reason stubs the reader directly, which is
   * the boundary this double deliberately refuses to blur.
   */
  const resolverRow = (userId: string): ResolverMembershipRow => ({
    id: `${userId}-m`,
    tenantId,
    userId,
    role: session()?.user?.role ?? "",
    status: "active",
    invitedById: null,
    createdAt: new Date(0),
    tenant: { id: tenantId, slug: tenantId, name: tenantId, status: "active", deletedAt: null },
  });

  return {
    listAllForUser: async (userId) => (session()?.user ? [resolverRow(userId)] : []),
    findByUserAndSlug: async (userId, slug) =>
      session()?.user && slug === tenantId ? resolverRow(userId) : null,
    listActiveForUser: async (userId) => {
      const user = session()?.user;
      if (!user) return [];
      return [
        {
          id: `${userId}-m`,
          tenantId,
          tenantSlug: tenantId,
          tenantName: tenantId,
          role: user.role ?? "",
        },
      ];
    },
  };
}
