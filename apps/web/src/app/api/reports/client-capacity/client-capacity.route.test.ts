import { describe, it, expect, beforeEach, vi } from "vitest";

/** GET /api/reports/client-capacity — gated `viewReports`. */

const h = vi.hoisted(() => ({
  session: null as { user: { id: string; email: string; name: string; role?: string } } | null,
  clientCapacity: vi.fn(),
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
  clientReportsService: { clientCapacity: h.clientCapacity },
}));

import { GET } from "./route";

const getReq = () => new Request("http://localhost/api/reports/client-capacity");

beforeEach(() => {
  h.session = null;
  h.clientCapacity.mockReset();
});

describe("GET /api/reports/client-capacity", () => {
  it("401 when signed out", async () => {
    const res = await GET(getReq(), undefined);
    expect(res.status).toBe(401);
    expect(h.clientCapacity).not.toHaveBeenCalled();
  });

  it("403 for a non-leadership role", async () => {
    h.session = { user: { id: "u1", email: "a@desta.works", name: "A", role: "Associate" } };
    const res = await GET(getReq(), undefined);
    expect(res.status).toBe(403);
    expect(h.clientCapacity).not.toHaveBeenCalled();
  });

  it("200 for Owner, delegates to the service", async () => {
    h.session = { user: { id: "u1", email: "o@desta.works", name: "O", role: "Owner" } };
    const result = { clients: [] };
    h.clientCapacity.mockResolvedValue(result);
    const res = await GET(getReq(), undefined);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(result);
  });
});
