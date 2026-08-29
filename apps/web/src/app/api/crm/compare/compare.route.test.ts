import { describe, it, expect, beforeEach, vi } from "vitest";

/** GET /api/crm/compare — gated `viewCrm`. */

const h = vi.hoisted(() => ({
  session: null as { user: { id: string; email: string; name: string; role?: string } } | null,
  compare: vi.fn(),
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
vi.mock("@destaworks/application/crm-analytics.service", () => ({
  crmAnalyticsService: { compare: h.compare },
}));

import { GET } from "./route";

const getReq = () => new Request("http://localhost/api/crm/compare");

beforeEach(() => {
  h.session = null;
  h.compare.mockReset();
});

describe("GET /api/crm/compare", () => {
  it("401 when signed out", async () => {
    const res = await GET(getReq(), undefined);
    expect(res.status).toBe(401);
    expect(h.compare).not.toHaveBeenCalled();
  });

  it("403 for a non-leadership role", async () => {
    h.session = { user: { id: "u1", email: "a@desta.works", name: "A", role: "Associate" } };
    const res = await GET(getReq(), undefined);
    expect(res.status).toBe(403);
  });

  it("200 for Owner, delegates to the service", async () => {
    h.session = { user: { id: "u1", email: "o@desta.works", name: "O", role: "Owner" } };
    h.compare.mockResolvedValue([]);
    const res = await GET(getReq(), undefined);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ clients: [] });
  });
});
