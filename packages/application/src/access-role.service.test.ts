import { describe, it, expect, beforeEach, vi } from "vitest";
import { CAPABILITIES, MODULES, ROLE_CAPABILITIES } from "@destaworks/domain/constants";

/**
 * `accessRoleService` — every other service SPENDS authority, this one defines it. What is asserted
 * here is the four guards rather than the CRUD.
 */

const h = vi.hoisted(() => ({
  listByTenant: vi.fn(),
  findByIdInTenant: vi.fn(),
  findByNameInTenant: vi.fn(),
  countActiveWithCapability: vi.fn(),
  countMembers: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  deleteInTenant: vi.fn(),
  writeAudit: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@destaworks/db/tenancy/access-role.repository", () => ({
  accessRoleRepository: {
    listByTenant: h.listByTenant,
    findByIdInTenant: h.findByIdInTenant,
    findByNameInTenant: h.findByNameInTenant,
    countActiveWithCapability: h.countActiveWithCapability,
    countMembers: h.countMembers,
    create: h.create,
    update: h.update,
    deleteInTenant: h.deleteInTenant,
  },
}));
vi.mock("@destaworks/db/audit", () => ({ writeAudit: h.writeAudit }));
vi.mock("@destaworks/db/with-transaction", () => ({
  withTenantTransaction: (_ctx: unknown, fn: (tx: unknown) => unknown) => fn({ tx: true }),
}));

import { accessRoleService } from "./access-role.service";
import type { TenantContext } from "@destaworks/domain/tenant";

function ctxWith(capabilities: readonly string[]): TenantContext {
  return {
    tenantId: "t1",
    membershipId: "m1",
    modules: MODULES,
    capabilities: capabilities as TenantContext["capabilities"],
    role: "Owner",
    user: { id: "u1", email: "owner@desta.works", name: "Owner" },
  };
}

const owner = ctxWith(ROLE_CAPABILITIES.Owner);
/** Can invite people — and so must be able to SEE the roles — but may not define one. */
const inviter = ctxWith(["manageUsers"]);

function role(overrides: Partial<Parameters<typeof h.create>[0]> & { id?: string } = {}) {
  return {
    id: overrides.id ?? "ar_1",
    name: overrides.name ?? "Recruiter",
    capabilities: overrides.capabilities ?? ["viewReports"],
    templateKey: overrides.templateKey ?? null,
    isBuiltIn: overrides.isBuiltIn ?? false,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  h.findByNameInTenant.mockResolvedValue(null);
  h.countMembers.mockResolvedValue(0);
  h.countActiveWithCapability.mockResolvedValue(3);
  h.create.mockImplementation(async (input: { name: string; capabilities: string[] }) =>
    role({ name: input.name, capabilities: input.capabilities }),
  );
  h.update.mockImplementation(
    async (_t: string, id: string, data: { name?: string; capabilities?: string[] }) =>
      role({ id, name: data.name, capabilities: data.capabilities }),
  );
});

describe("who may manage roles at all", () => {
  /** Choosing a role is half of inviting, so the LIST is weaker than DEFINING one. */
  it("separates seeing the roles from defining them", async () => {
    h.listByTenant.mockResolvedValue([]);

    await expect(accessRoleService.list(inviter)).resolves.toEqual({ roles: [] });

    for (const call of [
      () => accessRoleService.create(inviter, { name: "X", capabilities: [] }),
      () => accessRoleService.update(inviter, "ar_1", { name: "X", capabilities: [] }),
      () => accessRoleService.remove(inviter, "ar_1"),
    ]) {
      await expect(call()).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
    }
  });

  it("refuses the list to someone who manages neither users nor roles", async () => {
    await expect(accessRoleService.list(ctxWith([]))).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("guard 2 — you may only grant what you hold", () => {
  it("refuses a role granting a capability the author lacks", async () => {
    // A Director holds no `manageUsers`, so they cannot mint a role that does.
    await expect(
      accessRoleService.create(ctxWith([...ROLE_CAPABILITIES.Director, "manageRoles"]), {
        name: "Shadow Owner",
        capabilities: ["manageUsers"],
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });

    expect(h.create).not.toHaveBeenCalled();
  });

  it("allows a role granting only what the author already holds", async () => {
    await accessRoleService.create(owner, { name: "Recruiter", capabilities: ["viewReports"] });
    expect(h.create).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Recruiter", capabilities: ["viewReports"] }),
      { tx: true },
    );
  });

  it("applies on EDIT too, or the guard is one call away from being bypassed", async () => {
    h.findByIdInTenant.mockResolvedValue(role({ capabilities: [] }));

    await expect(
      accessRoleService.update(ctxWith([...ROLE_CAPABILITIES.Director, "manageRoles"]), "ar_1", {
        name: "Recruiter",
        capabilities: ["purgeCandidate"],
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("guard 1 — a workspace must keep an administrator", () => {
  it("refuses to strip manageUsers from the only role that has it", async () => {
    h.findByIdInTenant.mockResolvedValue(role({ capabilities: ["manageUsers"], isBuiltIn: true }));
    h.countMembers.mockResolvedValue(2);
    h.countActiveWithCapability.mockResolvedValue(2); // the same two people

    await expect(
      accessRoleService.update(owner, "ar_1", { name: "Owner", capabilities: ["viewReports"] }),
    ).rejects.toMatchObject({ code: "CONFLICT", status: 409 });

    expect(h.update).not.toHaveBeenCalled();
  });

  it("allows it when other administrators remain outside this role", async () => {
    h.findByIdInTenant.mockResolvedValue(role({ capabilities: ["manageUsers"] }));
    h.countMembers.mockResolvedValue(1);
    h.countActiveWithCapability.mockResolvedValue(3); // two more administer via another role

    await accessRoleService.update(owner, "ar_1", { name: "Owner", capabilities: ["viewReports"] });

    expect(h.update).toHaveBeenCalled();
  });

  it("does not count at all when the role keeps manageUsers", async () => {
    h.findByIdInTenant.mockResolvedValue(role({ capabilities: ["manageUsers"] }));

    await accessRoleService.update(owner, "ar_1", {
      name: "Owner",
      capabilities: ["manageUsers", "viewReports"],
    });

    expect(h.countActiveWithCapability).not.toHaveBeenCalled();
  });

  it("does not count when nobody holds the role being narrowed", async () => {
    h.findByIdInTenant.mockResolvedValue(role({ capabilities: ["manageUsers"] }));
    h.countMembers.mockResolvedValue(0);

    await accessRoleService.update(owner, "ar_1", { name: "Owner", capabilities: [] });

    expect(h.countActiveWithCapability).not.toHaveBeenCalled();
    expect(h.update).toHaveBeenCalled();
  });
});

describe("the capability vocabulary is closed", () => {
  it("rejects an unknown permission on write rather than silently dropping it", async () => {
    await expect(
      accessRoleService.create(owner, { name: "X", capabilities: ["viewReports", "ruleTheWorld"] }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    expect(h.create).not.toHaveBeenCalled();
  });

  it("accepts every capability the build actually knows", async () => {
    await accessRoleService.create(owner, { name: "Everything", capabilities: [...CAPABILITIES] });
    expect(h.create).toHaveBeenCalled();
  });

  it("de-duplicates, so a repeated permission is stored once", async () => {
    await accessRoleService.create(owner, {
      name: "X",
      capabilities: ["viewReports", "viewReports"],
    });
    expect(h.create).toHaveBeenCalledWith(
      expect.objectContaining({ capabilities: ["viewReports"] }),
      { tx: true },
    );
  });
});

describe("names are unique within a workspace", () => {
  it("refuses a second role with an existing name", async () => {
    h.findByNameInTenant.mockResolvedValue(role({ id: "ar_other" }));

    await expect(
      accessRoleService.create(owner, { name: "Recruiter", capabilities: [] }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("lets a role keep its own name on edit", async () => {
    h.findByIdInTenant.mockResolvedValue(role({ name: "Recruiter" }));

    await accessRoleService.update(owner, "ar_1", { name: "Recruiter", capabilities: [] });

    expect(h.findByNameInTenant).not.toHaveBeenCalled();
    expect(h.update).toHaveBeenCalled();
  });
});

describe("deleting a role", () => {
  it("refuses a built-in, so a workspace always has something to fall back to", async () => {
    h.findByIdInTenant.mockResolvedValue(role({ isBuiltIn: true }));

    await expect(accessRoleService.remove(owner, "ar_1")).rejects.toMatchObject({
      code: "CONFLICT",
    });
    expect(h.deleteInTenant).not.toHaveBeenCalled();
  });

  it("refuses while anyone still holds it, and says how many", async () => {
    h.findByIdInTenant.mockResolvedValue(role());
    h.countMembers.mockResolvedValue(3);

    await expect(accessRoleService.remove(owner, "ar_1")).rejects.toMatchObject({
      code: "CONFLICT",
      message: expect.stringContaining("3 members"),
    });
  });

  it("deletes a custom role nobody holds, and audits it", async () => {
    h.findByIdInTenant.mockResolvedValue(role());

    await expect(accessRoleService.remove(owner, "ar_1")).resolves.toEqual({ id: "ar_1" });

    expect(h.deleteInTenant).toHaveBeenCalledWith("t1", "ar_1", { tx: true });
    expect(h.writeAudit).toHaveBeenCalledWith(
      { tx: true },
      expect.objectContaining({ entity: "access_role", action: "delete_role", actor: "u1" }),
    );
  });

  it("refuses a role id from another workspace as though it did not exist", async () => {
    h.findByIdInTenant.mockResolvedValue(null);

    await expect(accessRoleService.remove(owner, "ar_elsewhere")).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});

describe("the list answers 'why can't Sarah see reports?'", () => {
  it("returns each role's capabilities and how many people hold it", async () => {
    h.listByTenant.mockResolvedValue([role({ id: "ar_1", name: "Recruiter" })]);
    h.countMembers.mockResolvedValue(4);

    const { roles } = await accessRoleService.list(owner);

    expect(roles).toEqual([
      {
        id: "ar_1",
        name: "Recruiter",
        capabilities: ["viewReports"],
        templateKey: null,
        isBuiltIn: false,
        memberCount: 4,
      },
    ]);
  });

  it("drops a stored capability this build does not know, so the screen matches the guards", async () => {
    h.listByTenant.mockResolvedValue([role({ capabilities: ["viewReports", "legacyThing"] })]);

    const { roles } = await accessRoleService.list(owner);

    expect(roles[0]?.capabilities).toEqual(["viewReports"]);
  });
});

describe("templates", () => {
  it("offers the built-ins as shipped, so a clone starts from a known-good default", () => {
    const templates = accessRoleService.templates();
    expect(templates.map((t) => t.name)).toEqual([
      "Owner",
      "Director",
      "Manager",
      "Screener",
      "Associate",
      "Admin",
    ]);
    expect(templates.find((t) => t.name === "Screener")?.capabilities).toEqual(["viewCredentials"]);
  });
});
