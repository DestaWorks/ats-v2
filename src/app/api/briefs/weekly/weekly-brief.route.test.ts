import { describe, it, expect, beforeEach, vi } from "vitest";

/** GET /api/briefs/weekly?weekStart= — guarded: unauth → 401, non-leadership → 403 (`viewReports`). */

const h = vi.hoisted(() => ({
  session: null as { user: { id: string; email: string; name: string; role?: string } } | null,
  getWeekly: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/server/auth/auth", () => ({ auth: { api: { getSession: async () => h.session } } }));
vi.mock("@/server/services/brief.service", () => ({ briefService: { getWeekly: h.getWeekly } }));

import { GET } from "./route";

const getReq = () => new Request("http://localhost/api/briefs/weekly?weekStart=2026-07-20");

beforeEach(() => {
  h.session = { user: { id: "u1", email: "u@desta.works", name: "U", role: "Owner" } };
  h.getWeekly.mockReset();
});

describe("GET /api/briefs/weekly", () => {
  it("401 when signed out (no service call)", async () => {
    h.session = null;
    const res = await GET(getReq(), undefined);
    expect(res.status).toBe(401);
    expect(h.getWeekly).not.toHaveBeenCalled();
  });

  it("403 for a non-leadership role (no service call)", async () => {
    h.session = { user: { id: "u1", email: "a@desta.works", name: "A", role: "Associate" } };
    const res = await GET(getReq(), undefined);
    expect(res.status).toBe(403);
    expect(h.getWeekly).not.toHaveBeenCalled();
  });

  it("200 returns null when nothing is saved for the week", async () => {
    h.getWeekly.mockResolvedValue(null);
    const res = await GET(getReq(), undefined);
    expect(res.status).toBe(200);
    expect(await res.json()).toBeNull();
    expect(h.getWeekly).toHaveBeenCalledWith("2026-07-20");
  });
});
