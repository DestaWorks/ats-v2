import { describe, it, expect, beforeEach, vi } from "vitest";

/** GET /api/analytics — gated `viewAnalytics` (leadership; same role set as `viewReports` today,
 *  but a distinct capability — this route must NOT accidentally check `viewReports` instead). */

const h = vi.hoisted(() => ({
  session: null as { user: { id: string; email: string; name: string; role?: string } } | null,
  overview: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/server/auth/auth", () => ({ auth: { api: { getSession: async () => h.session } } }));
vi.mock("@/server/services/analytics.service", () => ({
  analyticsService: { overview: h.overview },
}));

import { GET } from "./route";

const getReq = () => new Request("http://localhost/api/analytics");

beforeEach(() => {
  h.session = null;
  h.overview.mockReset();
});

describe("GET /api/analytics", () => {
  it("401 when signed out", async () => {
    const res = await GET(getReq(), undefined);
    expect(res.status).toBe(401);
    expect(h.overview).not.toHaveBeenCalled();
  });

  it("403 for a non-leadership role", async () => {
    h.session = { user: { id: "u1", email: "a@desta.works", name: "A", role: "Associate" } };
    const res = await GET(getReq(), undefined);
    expect(res.status).toBe(403);
    expect(h.overview).not.toHaveBeenCalled();
  });

  it("200 for Owner, delegates to the service", async () => {
    h.session = { user: { id: "u1", email: "o@desta.works", name: "O", role: "Owner" } };
    const result = { total: 0, byStatus: [], byClient: [], bySource: [] };
    h.overview.mockResolvedValue(result);
    const res = await GET(getReq(), undefined);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(result);
  });
});
