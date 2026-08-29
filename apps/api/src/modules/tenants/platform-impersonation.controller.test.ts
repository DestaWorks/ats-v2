import "reflect-metadata";
import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * `PlatformImpersonationController` — transport only.
 *
 * The service has its own suite for consent, the time box and the audit. What is asserted here is
 * the controller's own contribution: that it passes through what the server resolved rather than
 * anything the client sent, that it adds no authority of its own, and — the one that would be a
 * real defect — that the guards on each route match the axis that route acts on.
 */

const h = vi.hoisted(() => ({
  impersonation: {
    getSupportWindow: vi.fn(),
    grantSupportWindow: vi.fn(),
    revokeSupportWindow: vi.fn(),
    readActivityAsTenant: vi.fn(),
  },
}));

vi.mock("server-only", () => ({}));
vi.mock("@destaworks/config/request-context", () => ({
  requestContext: () => ({ headers: async () => new Headers(), cookie: async () => undefined }),
  installRequestContext: () => {},
}));
vi.mock("@destaworks/auth/auth", () => ({ auth: { api: { getSession: async () => null } } }));
vi.mock("@destaworks/db/prisma", () => ({ prisma: {} }));
vi.mock("@destaworks/application/platform-impersonation.service", () => ({
  platformImpersonationService: h.impersonation,
}));

import { readFileSync } from "node:fs";
import type { TenantContext } from "@destaworks/domain/tenant";
import type { AuthUser } from "@destaworks/auth/guards";
import { PlatformImpersonationController } from "./platform-impersonation.controller";

const controller = new PlatformImpersonationController(h.impersonation);

const user: AuthUser = { id: "u-platform", email: "ops@destaworks.com", name: "Ops" };
const tenant: TenantContext = {
  tenantId: "t1",
  membershipId: "m1",
  role: "Owner",
  user: { id: "u-owner", email: "owner@acme.example", name: "Acme Owner" },
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("the consent routes act inside one workspace", () => {
  it("passes the SERVER-resolved tenant context, never a client-named tenant", async () => {
    h.impersonation.grantSupportWindow.mockResolvedValue({ window: {} });

    await controller.grant({ minutes: 30, reason: "billing" }, tenant);

    expect(h.impersonation.grantSupportWindow).toHaveBeenCalledWith(tenant, {
      minutes: 30,
      reason: "billing",
    });
  });

  it("reads and withdraws through the same context", async () => {
    h.impersonation.getSupportWindow.mockResolvedValue({ window: {} });
    h.impersonation.revokeSupportWindow.mockResolvedValue({ window: {} });

    await controller.window(tenant);
    await controller.revoke(tenant);

    expect(h.impersonation.getSupportWindow).toHaveBeenCalledWith(tenant);
    expect(h.impersonation.revokeSupportWindow).toHaveBeenCalledWith(tenant);
  });
});

describe("the crossing route acts on the platform axis", () => {
  it("hands the service the signed-in identity and the slug, and nothing else", async () => {
    h.impersonation.readActivityAsTenant.mockResolvedValue({ items: [] });

    await controller.activity("acme", user);

    expect(h.impersonation.readActivityAsTenant).toHaveBeenCalledWith(user, "acme", null);
  });

  it("passes an opaque cursor straight through without interpreting it", async () => {
    h.impersonation.readActivityAsTenant.mockResolvedValue({ items: [] });

    await controller.activity("acme", user, "abc123");

    expect(h.impersonation.readActivityAsTenant).toHaveBeenCalledWith(user, "acme", "abc123");
  });

  it("does not swallow a refusal into an empty page", async () => {
    h.impersonation.readActivityAsTenant.mockRejectedValue(
      Object.assign(new Error("nope"), { code: "FORBIDDEN" }),
    );

    await expect(controller.activity("acme", user)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

/**
 * Guards are decorator metadata, so a behavioural test cannot see them. Reading the source is the
 * only way to assert the property that matters: the consent routes are inside a tenant, and the
 * crossing route deliberately is NOT — a `TenantGuard` there would refuse a platform admin, who
 * belongs to no workspace, which is exactly the person the route exists for.
 */
describe("the guards match the axis of each route", () => {
  const source = readFileSync(
    new URL("./platform-impersonation.controller.ts", import.meta.url),
    "utf8",
  );

  it("puts every consent route behind SessionAuthGuard AND TenantGuard", () => {
    const consentGuards = [
      ...source.matchAll(/@UseGuards\(([^)]*)\)\s*\n\s*async (window|grant|revoke)\b/g),
    ];

    expect(consentGuards).toHaveLength(3);
    for (const match of consentGuards) {
      expect(match[1]).toContain("SessionAuthGuard");
      expect(match[1]).toContain("TenantGuard");
    }
  });

  it("puts the crossing behind SessionAuthGuard alone", () => {
    const match = source.match(/@UseGuards\(([^)]*)\)\s*\n\s*async activity\b/);

    expect(match?.[1]).toContain("SessionAuthGuard");
    expect(match?.[1]).not.toContain("TenantGuard");
  });

  it("declares no tenant capability — a platform capability is not expressible there", () => {
    // Applied decorators only: the header comment explains why there are none, and naming it
    // there must not read as using it.
    const applied = source
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.startsWith("@RequireCapability("));

    expect(applied).toEqual([]);
  });
});
