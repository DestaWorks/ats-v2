import { describe, it, expect, beforeEach, vi } from "vitest";

/** GET /api/admin/portal/requests — gated `configureClientPortal`. */

const h = vi.hoisted(() => ({
  session: null as { user: { id: string; email: string; name: string; role?: string } } | null,
  list: vi.fn(),
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
vi.mock("@destaworks/db/prisma", () => ({ prisma: {} }));
vi.mock("@destaworks/application/portal-access-request.service", () => ({
  portalAccessRequestService: { list: h.list },
}));

import { GET } from "./route";

const getReq = () => new Request("http://localhost/api/admin/portal/requests");

beforeEach(() => {
  h.session = null;
  h.list.mockReset();
});

describe("GET /api/admin/portal/requests", () => {
  it("401 when signed out", async () => {
    const res = await GET(getReq(), undefined);
    expect(res.status).toBe(401);
    expect(h.list).not.toHaveBeenCalled();
  });

  it("403 for a non-configureClientPortal role (Director)", async () => {
    h.session = { user: { id: "u1", email: "d@desta.works", name: "D", role: "Director" } };
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
