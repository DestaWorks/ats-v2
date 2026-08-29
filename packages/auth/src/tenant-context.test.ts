import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * `resolveTenantContext` — the single place a claim becomes authority, and therefore the single
 * place this phase can leak. Everything asserted here is a refusal or a role, and only the
 * membership repository is mocked, so the real precedence-independent verification runs.
 *
 * The two headline cases:
 *
 *  - a client naming a tenant it has no active membership in gets NOTHING, even when it holds an
 *    active membership somewhere else (`switching cannot be forged`, below);
 *  - a tenant Owner naming another tenant is refused exactly like anyone else, because `Owner` is
 *    a value of a per-tenant role and not a way out of the tenant (6.8's done-when).
 */

const h = vi.hoisted(() => ({
  findByUserAndSlug: vi.fn(),
  listByUser: vi.fn(),
  setLogContext: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@destaworks/db/tenancy/membership.repository", () => ({
  membershipRepository: {
    findByUserAndSlug: h.findByUserAndSlug,
    listByUser: h.listByUser,
  },
}));
vi.mock("@destaworks/config/logger/request-context", () => ({ setLogContext: h.setLogContext }));

import { listTenantChoices, requireTenantContext, resolveTenantContext } from "./tenant-context";
import type { TenantClaim } from "./tenant-claim";
import type { AuthUser } from "./guards";

/** The signed-in person. `role` here is the legacy per-account role, and must never be consulted. */
const user: AuthUser = {
  id: "u1",
  email: "jane@desta.works",
  name: "Jane Doe",
};

function membership(overrides: {
  id?: string;
  tenantId?: string;
  role?: string;
  status?: string;
  slug?: string;
  tenantStatus?: string;
  deletedAt?: Date | null;
}) {
  return {
    id: overrides.id ?? "m1",
    tenantId: overrides.tenantId ?? "t1",
    userId: user.id,
    role: overrides.role ?? "Associate",
    status: overrides.status ?? "active",
    invitedById: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    tenant: {
      id: overrides.tenantId ?? "t1",
      slug: overrides.slug ?? "acme",
      name: "Acme Health",
      status: overrides.tenantStatus ?? "active",
      deletedAt: overrides.deletedAt ?? null,
    },
  };
}

const claimFor = (slug: string): TenantClaim => ({ source: "cookie", slug });

beforeEach(() => {
  vi.clearAllMocks();
  h.findByUserAndSlug.mockResolvedValue(null);
  h.listByUser.mockResolvedValue([]);
});

describe("resolveTenantContext — a verified claim", () => {
  it("resolves an active membership and takes the role from the MEMBERSHIP, not the user", async () => {
    h.findByUserAndSlug.mockResolvedValue(membership({ role: "Owner" }));

    const resolution = await resolveTenantContext(user, claimFor("acme"));

    expect(resolution).toMatchObject({
      outcome: "resolved",
      context: { tenantId: "t1", membershipId: "m1", role: "Owner" },
      tenant: { slug: "acme", name: "Acme Health" },
    });
    // The stale identity role is not merely unused now — it cannot be expressed:
    // `role` is gone from `AuthUser`, so reading one off the user is a compile error.
    expect("role" in user).toBe(false);
  });

  it("carries identity only into the context — no role on the user half", async () => {
    h.findByUserAndSlug.mockResolvedValue(membership({ role: "Manager" }));

    const resolution = await resolveTenantContext(user, claimFor("acme"));
    if (resolution.outcome !== "resolved") throw new Error("expected a resolved context");

    expect(resolution.context.user).toEqual({
      id: "u1",
      email: "jane@desta.works",
      name: "Jane Doe",
    });
    expect(resolution.context.user).not.toHaveProperty("role");
  });

  it("collapses an unrecognised membership role to the least privileged one", async () => {
    h.findByUserAndSlug.mockResolvedValue(membership({ role: "SuperOwner" }));

    const resolution = await resolveTenantContext(user, claimFor("acme"));

    expect(resolution).toMatchObject({ outcome: "resolved", context: { role: "Associate" } });
  });
});

describe("resolveTenantContext — a forged claim gets nothing", () => {
  it("refuses a tenant the user has no membership in", async () => {
    h.findByUserAndSlug.mockResolvedValue(null);

    expect(await resolveTenantContext(user, claimFor("northwind"))).toEqual({
      outcome: "denied",
      claim: claimFor("northwind"),
      reason: "no-membership",
    });
  });

  /**
   * The one that matters most. A user who legitimately belongs to `acme` names `northwind`. The
   * only safe answer is a refusal: silently serving `acme` would let a mutation land in a tenant
   * the URL did not name, and serving `northwind` would be the leak itself.
   */
  it("does NOT fall back to a tenant the user does belong to", async () => {
    h.findByUserAndSlug.mockImplementation(async (_userId: string, slug: string) =>
      slug === "acme" ? membership({}) : null,
    );
    h.listByUser.mockResolvedValue([membership({})]);

    const resolution = await resolveTenantContext(user, claimFor("northwind"));

    expect(resolution.outcome).toBe("denied");
    expect(h.listByUser).not.toHaveBeenCalled();
  });

  /** 6.8: no tenant role value, Owner included, reaches another tenant. */
  it("refuses a tenant OWNER who names a different tenant", async () => {
    h.findByUserAndSlug.mockImplementation(async (_userId: string, slug: string) =>
      slug === "acme" ? membership({ role: "Owner" }) : null,
    );

    await expect(requireTenantContext(user, claimFor("northwind"))).rejects.toMatchObject({
      code: "FORBIDDEN",
      status: 403,
    });
    await expect(requireTenantContext(user, claimFor("acme"))).resolves.toMatchObject({
      tenantId: "t1",
      role: "Owner",
    });
  });

  it("gives one message for a missing tenant and for a tenant that exists without you", async () => {
    const messages: string[] = [];
    for (const slug of ["nosuchtenant", "northwind"]) {
      await requireTenantContext(user, claimFor(slug)).catch((error: unknown) => {
        messages.push(error instanceof Error ? error.message : String(error));
      });
    }
    expect(messages).toHaveLength(2);
    expect(messages[0]).toBe(messages[1]);
  });
});

describe("resolveTenantContext — membership status is the whole gate", () => {
  it("refuses an INVITED membership — a pending invitation grants nothing", async () => {
    h.findByUserAndSlug.mockResolvedValue(membership({ status: "invited" }));

    expect(await resolveTenantContext(user, claimFor("acme"))).toMatchObject({
      outcome: "denied",
      reason: "invited",
    });
    await expect(requireTenantContext(user, claimFor("acme"))).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("refuses a REMOVED membership on the very next request, with no session to expire", async () => {
    h.findByUserAndSlug.mockResolvedValue(membership({ status: "removed", role: "Owner" }));

    expect(await resolveTenantContext(user, claimFor("acme"))).toMatchObject({
      outcome: "denied",
      reason: "removed",
    });
  });

  it("resolves an ACTIVE membership — the only status that grants access", async () => {
    h.findByUserAndSlug.mockResolvedValue(membership({ status: "active" }));

    expect(await resolveTenantContext(user, claimFor("acme"))).toMatchObject({
      outcome: "resolved",
    });
  });

  it("refuses every member of a suspended tenant, whatever their role", async () => {
    h.findByUserAndSlug.mockResolvedValue(membership({ role: "Owner", tenantStatus: "suspended" }));

    expect(await resolveTenantContext(user, claimFor("acme"))).toMatchObject({
      outcome: "denied",
      reason: "tenant-suspended",
    });
  });

  it("treats a soft-deleted tenant as one that is not there", async () => {
    h.findByUserAndSlug.mockResolvedValue(membership({ deletedAt: new Date() }));

    expect(await resolveTenantContext(user, claimFor("acme"))).toMatchObject({
      outcome: "denied",
      reason: "no-membership",
    });
  });
});

describe("resolveTenantContext — no claim", () => {
  it("places a user with exactly one active membership into it", async () => {
    h.listByUser.mockResolvedValue([membership({ role: "Director" })]);

    expect(await resolveTenantContext(user, null)).toMatchObject({
      outcome: "resolved",
      context: { role: "Director" },
    });
  });

  it("asks a user with several to choose rather than picking for them", async () => {
    h.listByUser.mockResolvedValue([
      membership({ id: "m1", tenantId: "t1", slug: "acme", role: "Owner" }),
      membership({ id: "m2", tenantId: "t2", slug: "northwind", role: "Screener" }),
    ]);

    const resolution = await resolveTenantContext(user, null);
    expect(resolution).toMatchObject({ outcome: "ambiguous" });
    await expect(requireTenantContext(user, null)).rejects.toMatchObject({
      code: "BAD_REQUEST",
      status: 400,
    });
  });

  it("counts only usable memberships when deciding whether the choice is ambiguous", async () => {
    h.listByUser.mockResolvedValue([
      membership({ id: "m1", tenantId: "t1", slug: "acme" }),
      membership({ id: "m2", tenantId: "t2", slug: "northwind", status: "invited" }),
      membership({ id: "m3", tenantId: "t3", slug: "meridian", status: "removed" }),
    ]);

    expect(await resolveTenantContext(user, null)).toMatchObject({
      outcome: "resolved",
      context: { tenantId: "t1" },
    });
  });

  it("refuses a user who belongs to nothing", async () => {
    h.listByUser.mockResolvedValue([]);

    expect(await resolveTenantContext(user, null)).toEqual({ outcome: "none" });
    await expect(requireTenantContext(user, null)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("requireTenantContext", () => {
  it("puts the resolved tenant into the log context", async () => {
    h.findByUserAndSlug.mockResolvedValue(membership({}));

    await requireTenantContext(user, claimFor("acme"));

    expect(h.setLogContext).toHaveBeenCalledWith({ tenantId: "t1" });
  });

  it("never sets a log tenant for a refused claim", async () => {
    h.findByUserAndSlug.mockResolvedValue(membership({ status: "removed" }));

    await requireTenantContext(user, claimFor("acme")).catch(() => undefined);

    expect(h.setLogContext).not.toHaveBeenCalled();
  });
});

describe("listTenantChoices", () => {
  it("offers active and invited workspaces, and hides removed ones", async () => {
    h.listByUser.mockResolvedValue([
      membership({ id: "m1", tenantId: "t1", slug: "acme" }),
      membership({ id: "m2", tenantId: "t2", slug: "northwind", status: "invited" }),
      membership({ id: "m3", tenantId: "t3", slug: "meridian", status: "removed" }),
      membership({ id: "m4", tenantId: "t4", slug: "gone", deletedAt: new Date() }),
    ]);

    expect(await listTenantChoices(user.id)).toEqual([
      { tenantId: "t1", slug: "acme", name: "Acme Health", role: "Associate", status: "active" },
      {
        tenantId: "t2",
        slug: "northwind",
        name: "Acme Health",
        role: "Associate",
        status: "invited",
      },
    ]);
  });
});
