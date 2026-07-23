import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * GET /api/admin/access-requests — gated `manageAccessRequests`: unauth → 401;
 * non-manageAccessRequests → 403; Owner → 200.
 */

const h = vi.hoisted(() => ({
  session: null as { user: { id: string; email: string; name: string; role?: string } } | null,
  list: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/server/auth/auth", () => ({ auth: { api: { getSession: async () => h.session } } }));
vi.mock("@/server/db/prisma", () => ({ prisma: {} }));
vi.mock("@/server/services/access-request.service", () => ({
  accessRequestService: { list: h.list },
}));

import { GET } from "./route";

const getReq = () => new Request("http://localhost/api/admin/access-requests");

beforeEach(() => {
  h.session = null;
  h.list.mockReset();
});

describe("GET /api/admin/access-requests", () => {
  it("401 when signed out", async () => {
    const res = await GET(getReq(), undefined);
    expect(res.status).toBe(401);
    expect(h.list).not.toHaveBeenCalled();
  });

  it("403 for a non-manageAccessRequests role (Manager)", async () => {
    h.session = { user: { id: "u1", email: "m@desta.works", name: "M", role: "Manager" } };
    const res = await GET(getReq(), undefined);
    expect(res.status).toBe(403);
    expect(h.list).not.toHaveBeenCalled();
  });

  it("200 for Owner", async () => {
    h.session = { user: { id: "u1", email: "o@desta.works", name: "O", role: "Owner" } };
    h.list.mockResolvedValue([]);
    const res = await GET(getReq(), undefined);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ requests: [] });
  });
});
