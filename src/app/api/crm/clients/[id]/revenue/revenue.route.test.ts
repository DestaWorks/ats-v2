import { describe, it, expect, beforeEach, vi } from "vitest";

/** GET /api/crm/clients/:id/revenue — gated `viewCrm`. */

const h = vi.hoisted(() => ({
  session: null as { user: { id: string; email: string; name: string; role?: string } } | null,
  revenue: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/server/auth/request-context", () => ({
  requestContext: () => ({ headers: async () => new Headers() }),
}));
vi.mock("@/server/auth/auth", () => ({ auth: { api: { getSession: async () => h.session } } }));
vi.mock("@/server/services/crm-analytics.service", () => ({
  crmAnalyticsService: { revenue: h.revenue },
}));

import { GET } from "./route";

const ctx = { params: Promise.resolve({ id: "c1" }) };
const getReq = () => new Request("http://localhost/api/crm/clients/c1/revenue");

beforeEach(() => {
  h.session = null;
  h.revenue.mockReset();
});

describe("GET /api/crm/clients/:id/revenue", () => {
  it("401 when signed out", async () => {
    const res = await GET(getReq(), ctx);
    expect(res.status).toBe(401);
    expect(h.revenue).not.toHaveBeenCalled();
  });

  it("403 for a non-leadership role", async () => {
    h.session = { user: { id: "u1", email: "a@desta.works", name: "A", role: "Associate" } };
    const res = await GET(getReq(), ctx);
    expect(res.status).toBe(403);
  });

  it("200 for Owner, delegates to the service", async () => {
    h.session = { user: { id: "u1", email: "o@desta.works", name: "O", role: "Owner" } };
    const result = {
      monthlyRate: null,
      avgPlacementFee: null,
      grossMargin: null,
      contractStart: null,
      lifetimePlacements: 0,
      placementsPerYear: null,
      annualizedRevenue: null,
      grossProfit: null,
      hoursInvested: 0,
      roiPerHour: null,
      lifetimeCumulative: null,
    };
    h.revenue.mockResolvedValue(result);
    const res = await GET(getReq(), ctx);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(result);
    expect(h.revenue).toHaveBeenCalledWith("c1");
  });
});
