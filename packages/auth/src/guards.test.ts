import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * Proves server-side authZ (IMPLEMENTATION-PLAN 0.3 done-when: "a non-admin provably
 * can't reach admin") and, since Phase 6.4, that it decides on the role held in the ACTIVE
 * TENANT. We mock the Better Auth session and the membership read, and install a stub
 * `RequestContext`, so the test exercises the *guard logic* — tenant resolution + role validation
 * + capability checks — without a DB or HTTP layer. Neither identity nor role ever originates
 * from the caller.
 */

// Controllable session for the mocked Better Auth instance.
let mockSession: { user: { id: string; email: string; name: string; role?: string } } | null = null;

// Controllable memberships for the mocked reader, plus the active-tenant hint on the request.
let mockMemberships: {
  id: string;
  plan: string;
  capabilities: string[];
  tenantId: string;
  tenantSlug: string;
  tenantName: string;
  role: string;
}[] = [];
let mockCookie: string | undefined;

// `server-only` throws outside a React Server Component build; neutralize it for the unit test.
vi.mock("server-only", () => ({}));

vi.mock("./auth", () => ({
  auth: { api: { getSession: async () => mockSession } },
}));

// The resolver reads a richer row than the switcher lists — `status` and the tenant's own state
// are what let a denial say why. These fixtures describe live memberships, so both views are
// derived from the one list rather than held consistent by hand.
const asResolverRow = (m: (typeof mockMemberships)[number]) => ({
  id: m.id,
  tenantId: m.tenantId,
  userId: "u1",
  role: m.role,
  status: "active",
  roleId: `ar_${m.role}`,
  accessRole: {
    id: `ar_${m.role}`,
    name: m.role,
    capabilities: m.capabilities,
    templateKey: m.role,
    isBuiltIn: true,
  },
  invitedById: null,
  createdAt: new Date(0),
  tenant: {
    id: m.tenantId,
    slug: m.tenantSlug,
    name: m.tenantName,
    status: "active",
    deletedAt: null,
    plan: m.plan,
  },
});

vi.mock("@destaworks/db/memberships", () => ({
  membershipReader: {
    listActiveForUser: async () => mockMemberships,
    listAllForUser: async () => mockMemberships.map(asResolverRow),
    findByUserAndSlug: async (_userId: string, slug: string) => {
      const hit = mockMemberships.find((m) => m.tenantSlug === slug);
      return hit ? asResolverRow(hit) : null;
    },
  },
}));

import { installRequestContext } from "@destaworks/config/request-context";
import {
  getCurrentUser,
  getSignedInIdentity,
  requireSignedInIdentity,
  requireUser,
  requireCapability,
  requireModule,
} from "./guards";
import { TENANT_COOKIE as ACTIVE_TENANT_COOKIE } from "@destaworks/domain/constants/tenancy";
import {
  MODULES,
  PLAN_MODULES,
  FALLBACK_PLAN,
  ROLE_CAPABILITIES,
  type Role,
} from "@destaworks/domain/constants";

installRequestContext({
  headers: async () => new Headers(),
  cookie: async (name) => (name === ACTIVE_TENANT_COOKIE ? mockCookie : undefined),
});

function signInAs(role?: string): void {
  mockSession = {
    user: {
      id: "u1",
      email: "u@desta.works",
      name: "Test User",
      // Still set on the session row — and deliberately NOT what any assertion below depends on.
      ...(role !== undefined && { role }),
    },
  };
}

/** One membership per tenant, so a test names a tenant, the role it holds, and what it pays for. */
function memberOf(
  ...tenants: { tenantId: string; role: string; plan?: string; capabilities?: string[] }[]
): void {
  mockMemberships = tenants.map(({ tenantId, role, plan, capabilities }) => ({
    id: `m-${tenantId}`,
    tenantId,
    tenantSlug: tenantId,
    tenantName: tenantId.toUpperCase(),
    role,
    plan: plan ?? "trial",
    capabilities: capabilities ?? [...(ROLE_CAPABILITIES[role as Role] ?? [])],
  }));
}

beforeEach(() => {
  mockSession = null;
  mockMemberships = [];
  mockCookie = undefined;
});

describe("auth guards — server-side authorization", () => {
  it("getCurrentUser returns null with no session", async () => {
    expect(await getCurrentUser()).toBeNull();
  });

  it("requireUser throws UNAUTHORIZED when signed out", async () => {
    await expect(requireUser()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("refuses a signed-in user who belongs to no tenant", async () => {
    signInAs("Owner");
    await expect(requireUser()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  // The platform plane is off the tenant axis, so belonging to no tenant is its NORMAL case.
  // Reading identity through the tenant-resolving guard 401'd exactly the operator /platform/*
  // exists for; these two prove the identity read does not depend on a tenant resolving.
  it("still reads the identity of a signed-in user who belongs to no tenant", async () => {
    signInAs("Owner");
    expect(await getCurrentUser()).toBeNull();
    expect(await getSignedInIdentity()).toMatchObject({ id: "u1" });
    await expect(requireSignedInIdentity()).resolves.toMatchObject({ id: "u1" });
  });

  it("still reads the identity when two memberships make the tenant ambiguous", async () => {
    signInAs("Owner");
    memberOf({ tenantId: "tenant-a", role: "Owner" }, { tenantId: "tenant-b", role: "Associate" });
    expect(await getCurrentUser()).toBeNull();
    await expect(requireSignedInIdentity()).resolves.toMatchObject({ id: "u1" });
  });

  it("refuses an identity read with no session at all", async () => {
    expect(await getSignedInIdentity()).toBeNull();
    await expect(requireSignedInIdentity()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  /**
   * Least privilege moved, it did not go away.
   *
   * A role NAME is now whatever the workspace called its role, so coercing it to "Associate" would
   * be wrong — a firm's "Superuser" is a legitimate name. What must never be trusted is the
   * CAPABILITY list, and `toCapabilities` drops every code this build does not know. So a row full
   * of invented permissions grants nothing, which is the same guarantee by the only route that
   * still makes sense.
   */
  it("keeps an unfamiliar role NAME but grants nothing it does not recognise", async () => {
    signInAs();
    memberOf({
      tenantId: "t1",
      role: "Superuser",
      capabilities: ["rule-the-world", "viewReports"],
    });

    const context = await getCurrentUser();

    expect(context?.role).toBe("Superuser");
    expect(context?.capabilities).toEqual(["viewReports"]);
  });

  it("grants nothing at all when a role row carries no recognisable capability", async () => {
    signInAs();
    memberOf({ tenantId: "t1", role: "", capabilities: ["nonsense"] });

    const context = await getCurrentUser();

    expect(context?.capabilities).toEqual([]);
    await expect(requireCapability("viewReports")).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("blocks a non-leadership role from a leadership capability", async () => {
    signInAs();
    memberOf({ tenantId: "t1", role: "Associate" });
    await expect(requireCapability("viewReports")).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("admits a leadership role through the same capability", async () => {
    signInAs();
    memberOf({ tenantId: "t1", role: "Owner" });
    expect((await requireCapability("viewReports")).role).toBe("Owner");
  });

  it("resolves the tenant, the membership and the identity onto one context", async () => {
    signInAs();
    memberOf({ tenantId: "t1", role: "Owner" });
    expect(await requireUser()).toEqual({
      tenantId: "t1",
      membershipId: "m-t1",
      user: { id: "u1", email: "u@desta.works", name: "Test User", image: null },
      role: "Owner",
      modules: MODULES,
      capabilities: ROLE_CAPABILITIES.Owner,
    });
  });

  it("resolves the tenant's modules from its plan, independently of role", async () => {
    signInAs();
    memberOf({ tenantId: "t1", role: "Owner", plan: "starter" });
    const context = await requireUser();
    expect(context.role).toBe("Owner");
    expect(context.modules).toEqual(PLAN_MODULES.starter);
    expect(context.modules).not.toContain("reports");
  });

  it("falls back to the least entitled plan when the stored value is unrecognised", async () => {
    signInAs();
    memberOf({ tenantId: "t1", role: "Owner", plan: "enterprise-platinum" });
    expect((await requireUser()).modules).toEqual(PLAN_MODULES[FALLBACK_PLAN]);
  });

  it("refuses a module the plan excludes, even for an Owner", async () => {
    signInAs();
    memberOf({ tenantId: "t1", role: "Owner", plan: "starter" });
    await expect(requireModule("reports")).rejects.toMatchObject({
      code: "PLAN_UPGRADE_REQUIRED",
      status: 402,
    });
    await expect(requireModule("compliance")).resolves.toMatchObject({ role: "Owner" });
  });
});

/**
 * The reason `role` moved off the user row. Every case here would pass just as well before the
 * move if the user happened to have one tenant — so each one puts the SAME person in two tenants
 * and asserts the answer changes with the active one.
 */
describe("a role is a fact about a tenant, not about a person", () => {
  const OWNER_IN_A_ASSOCIATE_IN_B = () => {
    signInAs("Owner"); // the stale `User.role`, if anything still read it
    memberOf({ tenantId: "tenant-a", role: "Owner" }, { tenantId: "tenant-b", role: "Associate" });
  };

  it("grants the Owner's capabilities while tenant A is active", async () => {
    OWNER_IN_A_ASSOCIATE_IN_B();
    mockCookie = "tenant-a";

    const context = await requireCapability("manageUsers");
    expect(context.tenantId).toBe("tenant-a");
    expect(context.membershipId).toBe("m-tenant-a");
    expect(context.role).toBe("Owner");
  });

  it("grants only the Associate's capabilities while tenant B is active", async () => {
    OWNER_IN_A_ASSOCIATE_IN_B();
    mockCookie = "tenant-b";

    const context = await requireUser();
    expect(context.tenantId).toBe("tenant-b");
    expect(context.membershipId).toBe("m-tenant-b");
    expect(context.role).toBe("Associate");
    // Same person, same session, same request — and now refused.
    await expect(requireCapability("manageUsers")).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(requireCapability("viewReports")).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("refuses to GUESS a tenant when the user belongs to several and names none", async () => {
    OWNER_IN_A_ASSOCIATE_IN_B();

    // Deliberately not "defaults to the first". Picking one silently is how a write lands in the
    // wrong workspace for someone who is Owner in A and Associate in B — the same request would
    // carry different authority depending on membership order. The resolver reports `ambiguous`
    // and the client sends the user to the switcher.
    expect(await getCurrentUser()).toBeNull();
    await expect(requireUser()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("resolves without a claim when there is exactly one membership to resolve to", async () => {
    signInAs();
    memberOf({ tenantId: "t1", role: "Owner" });

    expect((await requireUser()).tenantId).toBe("t1");
  });

  it("refuses a tenant the user is not a member of rather than falling back to one they are", async () => {
    OWNER_IN_A_ASSOCIATE_IN_B();
    mockCookie = "tenant-c";

    expect(await getCurrentUser()).toBeNull();
    await expect(requireUser()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});
