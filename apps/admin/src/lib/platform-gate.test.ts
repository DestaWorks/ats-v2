import { afterEach, describe, expect, it } from "vitest";
import type { AuthUser } from "@destaworks/auth/guards";
import { PLATFORM_CAPABILITIES } from "@destaworks/domain/platform";
import { gateFor } from "./platform-gate";

const ADMIN: AuthUser = {
  id: "usr_platform_admin",
  email: "operator@example.com",
  name: "Operator",
  image: null,
};

const TENANT_USER: AuthUser = {
  id: "usr_tenant_owner",
  email: "owner@example.com",
  name: "Owner",
  image: null,
};

function allowlist(value: string | undefined): void {
  if (value === undefined) delete process.env["PLATFORM_ADMIN_USER_IDS"];
  else process.env["PLATFORM_ADMIN_USER_IDS"] = value;
}

afterEach(() => allowlist(undefined));

describe("gateFor", () => {
  it("grants a user on the allowlist every platform capability", () => {
    allowlist(ADMIN.id);
    const gate = gateFor(ADMIN);
    expect(gate.outcome).toBe("granted");
    if (gate.outcome !== "granted") return;
    expect(gate.context.user.id).toBe(ADMIN.id);
    expect(gate.context.capabilities).toEqual(PLATFORM_CAPABILITIES);
  });

  it("grants a user listed among several ids", () => {
    allowlist(` ${TENANT_USER.id} , ${ADMIN.id} `);
    expect(gateFor(ADMIN).outcome).toBe("granted");
  });

  it("REFUSES a signed-in tenant user who is not on the allowlist", () => {
    allowlist(ADMIN.id);
    expect(gateFor(TENANT_USER)).toEqual({ outcome: "refused" });
  });

  it("refuses everyone when the plane is unconfigured — never falls open", () => {
    allowlist(undefined);
    expect(gateFor(ADMIN)).toEqual({ outcome: "refused" });
    expect(gateFor(TENANT_USER)).toEqual({ outcome: "refused" });
  });

  it("refuses when the variable is present but empty", () => {
    allowlist("   ,  , ");
    expect(gateFor(ADMIN)).toEqual({ outcome: "refused" });
  });

  it("reports no session as signed-out, distinctly from a refusal", () => {
    allowlist(ADMIN.id);
    expect(gateFor(null)).toEqual({ outcome: "signed-out" });
  });

  it("never grants on an email match — the allowlist keys on user id", () => {
    allowlist(ADMIN.email);
    expect(gateFor(ADMIN)).toEqual({ outcome: "refused" });
  });

  it("does not grant a refused user a tenant to be redirected into", () => {
    allowlist(ADMIN.id);
    const gate = gateFor(TENANT_USER);
    expect(Object.keys(gate)).toEqual(["outcome"]);
  });

  it("carries no tenantId on a granted context", () => {
    allowlist(ADMIN.id);
    const gate = gateFor(ADMIN);
    if (gate.outcome !== "granted") throw new Error("expected granted");
    expect(gate.context).not.toHaveProperty("tenantId");
    expect(gate.context).not.toHaveProperty("role");
  });
});
