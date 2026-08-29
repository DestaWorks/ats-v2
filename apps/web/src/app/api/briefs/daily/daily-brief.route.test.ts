import { describe, it, expect, beforeEach, vi } from "vitest";

/** GET /api/briefs/daily?date= — guarded: unauth → 401, non-leadership → 403 (`viewReports`). */

const h = vi.hoisted(() => ({
  session: null as { user: { id: string; email: string; name: string; role?: string } } | null,
  getDaily: vi.fn(),
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
vi.mock("@destaworks/application/brief.service", () => ({
  briefService: { getDaily: h.getDaily },
}));

import { GET } from "./route";

const getReq = () => new Request("http://localhost/api/briefs/daily?date=2026-07-23");

beforeEach(() => {
  h.session = { user: { id: "u1", email: "u@desta.works", name: "U", role: "Owner" } };
  h.getDaily.mockReset();
});

describe("GET /api/briefs/daily", () => {
  it("401 when signed out (no service call)", async () => {
    h.session = null;
    const res = await GET(getReq(), undefined);
    expect(res.status).toBe(401);
    expect(h.getDaily).not.toHaveBeenCalled();
  });

  it("403 for a non-leadership role (no service call)", async () => {
    h.session = { user: { id: "u1", email: "a@desta.works", name: "A", role: "Associate" } };
    const res = await GET(getReq(), undefined);
    expect(res.status).toBe(403);
    expect(h.getDaily).not.toHaveBeenCalled();
  });

  it("200 returns null when nothing is saved for the date", async () => {
    h.getDaily.mockResolvedValue(null);
    const res = await GET(getReq(), undefined);
    expect(res.status).toBe(200);
    expect(await res.json()).toBeNull();
    expect(h.getDaily).toHaveBeenCalledWith(
      "2026-07-23",
      expect.objectContaining({ tenantId: "t1" }),
    );
  });
});
