import { describe, it, expect, beforeEach, vi } from "vitest";

/** POST /api/admin/users/:id/ban — gated `manageUsers`: unauth → 401; non-manageUsers → 403; Owner → 200. */

const h = vi.hoisted(() => ({
  session: null as { user: { id: string; email: string; name: string; role?: string } } | null,
  ban: vi.fn(),
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
vi.mock("@destaworks/application/admin-user.service", () => ({ adminUserService: { ban: h.ban } }));

import { POST } from "./route";

const ctx = { params: Promise.resolve({ id: "u2" }) };
function postReq(body: unknown) {
  return new Request("http://localhost/api/admin/users/u2/ban", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  h.session = null;
  h.ban.mockReset();
});

describe("POST /api/admin/users/:id/ban", () => {
  it("401 when signed out and does not ban", async () => {
    const res = await POST(postReq({}), ctx);
    expect(res.status).toBe(401);
    expect(h.ban).not.toHaveBeenCalled();
  });

  it("403 for a non-manageUsers role (Manager)", async () => {
    h.session = { user: { id: "u1", email: "m@desta.works", name: "M", role: "Manager" } };
    const res = await POST(postReq({}), ctx);
    expect(res.status).toBe(403);
    expect(h.ban).not.toHaveBeenCalled();
  });

  it("200 for Owner — forwards id + validated input", async () => {
    h.session = { user: { id: "u1", email: "o@desta.works", name: "O", role: "Owner" } };
    h.ban.mockResolvedValue({ id: "u2", banned: true });
    const res = await POST(postReq({ reason: "abuse" }), ctx);
    expect(res.status).toBe(200);
    expect(h.ban).toHaveBeenCalledWith(
      "u2",
      expect.objectContaining({ reason: "abuse" }),
      expect.objectContaining({ user: expect.objectContaining({ id: "u1" }) }),
    );
  });
});
