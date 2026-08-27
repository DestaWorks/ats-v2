import { describe, it, expect, beforeEach, vi } from "vitest";

/** GET /api/crm/clients/:id/health — gated `viewCrm`. */

const h = vi.hoisted(() => ({
  session: null as { user: { id: string; email: string; name: string; role?: string } } | null,
  healthScore: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@destaworks/config/request-context", () => ({
  requestContext: () => ({ headers: async () => new Headers() }),
}));
vi.mock("@destaworks/auth/auth", () => ({ auth: { api: { getSession: async () => h.session } } }));
vi.mock("@destaworks/application/crm-analytics.service", () => ({
  crmAnalyticsService: { healthScore: h.healthScore },
}));

import { GET } from "./route";

const ctx = { params: Promise.resolve({ id: "c1" }) };
const getReq = () => new Request("http://localhost/api/crm/clients/c1/health");

beforeEach(() => {
  h.session = null;
  h.healthScore.mockReset();
});

describe("GET /api/crm/clients/:id/health", () => {
  it("401 when signed out", async () => {
    const res = await GET(getReq(), ctx);
    expect(res.status).toBe(401);
    expect(h.healthScore).not.toHaveBeenCalled();
  });

  it("403 for a non-leadership role", async () => {
    h.session = { user: { id: "u1", email: "a@desta.works", name: "A", role: "Associate" } };
    const res = await GET(getReq(), ctx);
    expect(res.status).toBe(403);
  });

  it("200 for Owner, delegates to the service", async () => {
    h.session = { user: { id: "u1", email: "o@desta.works", name: "O", role: "Owner" } };
    const result = {
      score: 80,
      tier: "Healthy",
      breakdown: { pipeline: 40, communication: 25, tasks: 15 },
      daysSinceLastTouch: 3,
    };
    h.healthScore.mockResolvedValue(result);
    const res = await GET(getReq(), ctx);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(result);
    expect(h.healthScore).toHaveBeenCalledWith("c1");
  });
});
