import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";

/**
 * Contract test for `LicenseVerifyController` (SAAS-RESTRUCTURE-PLAN 4.3).
 *
 * The gate is the point, and here the risk runs the other way from `CredentialsController`: this
 * endpoint sits in a module whose other controller is gated on `viewCredentials`, so what has to be
 * pinned is that a capability-less operator IS admitted — the page it serves requires only a
 * session, and a Screener who cannot see what is blocking a stage cannot unblock it. The refusal
 * that must hold is the signed-out one.
 */

const h = vi.hoisted(() => ({
  session: null as { user: { id: string; email: string; name: string; role?: string } } | null,
  licenseVerify: { dashboard: vi.fn() },
}));

vi.mock("server-only", () => ({}));
vi.mock("@destaworks/auth/auth", () => ({ auth: { api: { getSession: async () => h.session } } }));
vi.mock("@destaworks/db/memberships", async () => ({
  membershipReader: (
    await import("@destaworks/auth/testing/membership-double")
  ).singleTenantMembershipReader(() => h.session),
}));
vi.mock("@destaworks/db/prisma", () => ({ prisma: {} }));
vi.mock("@destaworks/application/credentials-intelligence.service", () => ({
  credentialsIntelligenceService: {},
}));
vi.mock("@destaworks/application/license-verify.service", () => ({
  licenseVerifyService: h.licenseVerify,
}));

import {
  startContractHost,
  type ContractHost,
  type ErrorEnvelope,
} from "../../common/testing/contract-host";
import { CredentialsModule } from "./credentials.module";

const DASHBOARD = {
  queue: [
    {
      id: "c1",
      name: "Jane Doe",
      credential: "PMHNP",
      licenseState: "TX",
      clientName: null,
      licenseStatus: "Unverified",
    },
  ],
  timeline: [
    {
      id: "c2",
      name: "John Roe",
      credential: "LCSW",
      licenseState: "TX",
      licenseExpiry: "2026-12-01T00:00:00.000Z",
      daysLeft: 98,
    },
  ],
  queueTruncated: false,
};

let api: ContractHost;

function signInAs(role: string): void {
  h.session = { user: { id: "u1", email: "u@desta.works", name: "Test User", role } };
}

beforeAll(async () => {
  api = await startContractHost(CredentialsModule);
});

afterAll(async () => {
  await api.close();
});

beforeEach(() => {
  vi.clearAllMocks();
  h.licenseVerify.dashboard.mockResolvedValue(DASHBOARD);
});

describe("GET /license-verify/dashboard", () => {
  it("answers both lists to an operator holding no capabilities", async () => {
    signInAs("Associate");
    const res = await api.request("/license-verify/dashboard");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(DASHBOARD);
  });

  it("passes the viewer through and leaves the clock to the service default", async () => {
    signInAs("Owner");
    await api.request("/license-verify/dashboard");
    expect(h.licenseVerify.dashboard).toHaveBeenCalledTimes(1);
    const call = h.licenseVerify.dashboard.mock.calls[0] ?? [];
    expect(call[0]).toMatchObject({ user: { id: "u1" } });
    expect(call).toHaveLength(1);
  });

  it("refuses a signed-out caller with 401 and reads nothing", async () => {
    h.session = null;
    const res = await api.request("/license-verify/dashboard");
    expect(res.status).toBe(401);
    expect(((await res.json()) as ErrorEnvelope).error.code).toBe("UNAUTHORIZED");
    expect(h.licenseVerify.dashboard).not.toHaveBeenCalled();
  });

  // Neither list carries a licence number; the queue publishes only state and status.
  it("never puts a licence number on the wire", async () => {
    signInAs("Owner");
    const res = await api.request("/license-verify/dashboard");
    expect(await res.text()).not.toContain("licenseNumber");
  });
});
