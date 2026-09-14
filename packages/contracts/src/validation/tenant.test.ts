import { describe, it, expect } from "vitest";
import {
  acceptInvitationSchema,
  inviteMemberSchema,
  switchTenantSchema,
  tenantSlugSchema,
} from "./tenant";

/**
 * The body-supplied slug has to be governed by exactly the same rules as the URL-supplied one.
 * A looser schema here would be the second door into the resolution path — the request the URL
 * reader refuses, arriving as JSON instead.
 */
describe("tenantSlugSchema", () => {
  it("normalises to the one canonical form the URL forms produce", () => {
    expect(tenantSlugSchema.parse("  ACME ")).toBe("acme");
  });

  it("rejects a reserved slug, so infrastructure cannot be claimed through the body", () => {
    for (const slug of ["api", "admin", "www"]) {
      expect(tenantSlugSchema.safeParse(slug).success).toBe(false);
    }
  });

  it("rejects anything that is not a DNS label", () => {
    for (const slug of ["-acme", "acme-", "acme.co", "a b", "", "a".repeat(64)]) {
      expect(tenantSlugSchema.safeParse(slug).success).toBe(false);
    }
  });
});

describe("the tenancy request schemas", () => {
  it("switch and accept both take one slug and reject unknown keys", () => {
    expect(switchTenantSchema.parse({ tenant: "ACME" })).toEqual({ tenant: "acme" });
    expect(acceptInvitationSchema.parse({ tenant: "acme" })).toEqual({ tenant: "acme" });
    expect(switchTenantSchema.safeParse({ tenant: "acme", role: "Owner" }).success).toBe(false);
  });

  /**
   * The role is named by its ROW id, not by a value from an enum: roles are tenant-owned, so
   * "Director" is not a stable identifier and a workspace may hold roles no enum could list. The
   * id is a claim like any other — the service resolves it within the tenant before granting.
   */
  it("an invite names an account and one of the workspace's own role rows", () => {
    expect(
      inviteMemberSchema.parse({ email: " John@Desta.Works ", roleId: "ar_Screener" }),
    ).toEqual({
      email: "John@Desta.Works",
      roleId: "ar_Screener",
    });
    expect(inviteMemberSchema.safeParse({ email: "john@desta.works", roleId: "" }).success).toBe(
      false,
    );
    expect(
      inviteMemberSchema.safeParse({ email: "not-an-email", roleId: "ar_Owner" }).success,
    ).toBe(false);
  });

  it("an invite cannot smuggle a membership status past the schema", () => {
    expect(
      inviteMemberSchema.safeParse({
        email: "john@desta.works",
        role: "Owner",
        status: "active",
      }).success,
    ).toBe(false);
  });
});
