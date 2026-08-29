import { describe, it, expect, afterEach, beforeEach } from "vitest";
import {
  platformPlaneEnabled,
  requirePlatformCapability,
  resolvePlatformContext,
} from "./platform-admin";
import type { AuthUser } from "./guards";

/**
 * The platform axis (6.8). What is being proved is a NEGATIVE: that nothing a tenant can express
 * reaches this plane. So most of these cases hand the resolver the most privileged tenant identity
 * available — an `Owner` — and assert it gets nothing.
 */

const ORIGINAL = process.env["PLATFORM_ADMIN_USER_IDS"];

function userWith(overrides: Partial<AuthUser> = {}): AuthUser {
  return {
    id: "u1",
    email: "jane@desta.works",
    name: "Jane Doe",
    ...overrides,
  };
}

beforeEach(() => {
  delete process.env["PLATFORM_ADMIN_USER_IDS"];
});

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env["PLATFORM_ADMIN_USER_IDS"];
  else process.env["PLATFORM_ADMIN_USER_IDS"] = ORIGINAL;
});

describe("the platform axis is not reachable from a tenant role", () => {
  it("gives an Owner nothing when the plane is unconfigured", () => {
    expect(resolvePlatformContext(userWith({}))).toBeNull();
    expect(platformPlaneEnabled()).toBe(false);
  });

  it("gives an Owner nothing when the plane is configured for somebody else", () => {
    process.env["PLATFORM_ADMIN_USER_IDS"] = "u999";

    expect(resolvePlatformContext(userWith({}))).toBeNull();
    expect(() => requirePlatformCapability(userWith({}), "readTenantData")).toThrow(
      expect.objectContaining({ code: "FORBIDDEN" }),
    );
  });

  it("refuses every one of the six tenant roles when they are not on the list", () => {
    process.env["PLATFORM_ADMIN_USER_IDS"] = "u999";
    for (const role of [
      "Owner",
      "Admin",
      "Director",
      "Manager",
      "Screener",
      "Associate",
    ] as const) {
      // The role can no longer be put ON the user — `AuthUser` has no such field, which is the
      // structural half of 6.8. So this varies the identity instead and asserts the plane is
      // closed to every ordinary account. That a tenant OWNER is refused is proven against a real
      // `TenantContext` in `platform-admin.service.test.ts`, which is where a role actually lives.
      expect(resolvePlatformContext(userWith({ id: `u-${role.toLowerCase()}` }))).toBeNull();
    }
  });

  /**
   * The escalation the id-based allowlist exists to close: a tenant Admin holds `manageUsers` and
   * can create accounts, so an EMAIL allowlist would let them mint an account at a listed address
   * and sign in with platform powers. Ids are minted by the database and cannot be chosen.
   */
  it("does not accept an email, however exactly it matches the configured account", () => {
    process.env["PLATFORM_ADMIN_USER_IDS"] = "jane@desta.works";

    expect(resolvePlatformContext(userWith({ id: "u1", email: "jane@desta.works" }))).toBeNull();
  });
});

describe("a configured platform admin", () => {
  it("resolves with the platform capabilities and identity only", () => {
    process.env["PLATFORM_ADMIN_USER_IDS"] = "u1,u2";

    const context = resolvePlatformContext(userWith());

    expect(context).not.toBeNull();
    expect(context?.user).toEqual({ id: "u1", email: "jane@desta.works" });
    expect(context?.capabilities).toContain("readTenantData");
    expect(context?.user).not.toHaveProperty("role");
  });

  it("tolerates whitespace and empty entries in the configured list", () => {
    process.env["PLATFORM_ADMIN_USER_IDS"] = " u1 , , u2,";

    expect(resolvePlatformContext(userWith())).not.toBeNull();
    expect(resolvePlatformContext(userWith({ id: "u2" }))).not.toBeNull();
  });

  it("does not treat an empty configuration as a match for an empty id", () => {
    process.env["PLATFORM_ADMIN_USER_IDS"] = ",, ,";

    expect(platformPlaneEnabled()).toBe(false);
    expect(resolvePlatformContext(userWith({ id: "" }))).toBeNull();
  });

  it("returns the context from requirePlatformCapability when the capability is held", () => {
    process.env["PLATFORM_ADMIN_USER_IDS"] = "u1";

    expect(requirePlatformCapability(userWith(), "viewTenants").user.id).toBe("u1");
  });
});
