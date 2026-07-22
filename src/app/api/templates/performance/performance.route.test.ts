import { describe, it, expect, vi } from "vitest";

/**
 * GET /api/templates/performance — the guarded analytics read: unauth → 401; a non-`viewAnalytics`
 * role (Associate) → 403; a leadership role (Director) → 200 with the service's result.
 * `templatePerformanceService` is mocked (unit-tested separately); auth runs for real.
 */

const h = vi.hoisted(() => ({
  session: null as { user: { id: string; email: string; name: string; role?: string } } | null,
  overview: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/server/auth/auth", () => ({ auth: { api: { getSession: async () => h.session } } }));
vi.mock("@/server/db/prisma", () => ({ prisma: {} }));
vi.mock("@/server/services/template-performance.service", () => ({
  templatePerformanceService: { overview: h.overview },
}));

import { GET } from "./route";

function req() {
  return new Request("http://localhost/api/templates/performance");
}

describe("GET /api/templates/performance", () => {
  it("401 when signed out and does not read", async () => {
    h.session = null;
    const res = await GET(req(), undefined);
    expect(res.status).toBe(401);
    expect(h.overview).not.toHaveBeenCalled();
  });

  it("403 for a non-viewAnalytics role (Associate) and reads nothing", async () => {
    h.session = { user: { id: "u2", email: "a@desta.works", name: "A", role: "Associate" } };
    const res = await GET(req(), undefined);
    expect(res.status).toBe(403);
    expect(h.overview).not.toHaveBeenCalled();
  });

  it("200 with the overview for a leadership role (Director)", async () => {
    h.session = { user: { id: "u1", email: "d@desta.works", name: "D", role: "Director" } };
    h.overview.mockResolvedValue({ rows: [] });
    const res = await GET(req(), undefined);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ rows: [] });
  });
});
