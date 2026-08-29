import { describe, it, expect, beforeEach, vi } from "vitest";

/** GET /api/reports/client-funnel — gated `viewReports`. */

const h = vi.hoisted(() => ({
  session: null as { user: { id: string; email: string; name: string; role?: string } } | null,
  perClientFunnel: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@destaworks/config/request-context", () => ({
  requestContext: () => ({ headers: async () => new Headers(), cookie: async () => undefined }),
}));
vi.mock("@destaworks/auth/auth", () => ({ auth: { api: { getSession: async () => h.session } } }));
vi.mock("@destaworks/db/memberships", async () => ({
  membershipReader: (
    await import("@destaworks/auth/testing/membership-double")
  ).singleTenantMembershipReader(() => h.session),
}));
vi.mock("@destaworks/application/reports/client-reports.service", () => ({
  clientReportsService: { perClientFunnel: h.perClientFunnel },
}));

import { GET } from "./route";

const getReq = () => new Request("http://localhost/api/reports/client-funnel");

beforeEach(() => {
  h.session = null;
  h.perClientFunnel.mockReset();
});

describe("GET /api/reports/client-funnel", () => {
  it("401 when signed out", async () => {
    const res = await GET(getReq(), undefined);
    expect(res.status).toBe(401);
    expect(h.perClientFunnel).not.toHaveBeenCalled();
  });

  it("403 for a non-leadership role", async () => {
    h.session = { user: { id: "u1", email: "a@desta.works", name: "A", role: "Associate" } };
    const res = await GET(getReq(), undefined);
    expect(res.status).toBe(403);
    expect(h.perClientFunnel).not.toHaveBeenCalled();
  });

  it("200 for Owner, delegates to the service", async () => {
    h.session = { user: { id: "u1", email: "o@desta.works", name: "O", role: "Owner" } };
    const result = { clients: [] };
    h.perClientFunnel.mockResolvedValue(result);
    const res = await GET(getReq(), undefined);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(result);
  });
});
