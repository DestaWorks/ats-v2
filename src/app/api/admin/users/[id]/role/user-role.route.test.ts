import { describe, it, expect, beforeEach, vi } from "vitest";

/** PATCH /api/admin/users/:id/role — gated `manageRoles`: unauth → 401; non-manageRoles → 403; Owner → 200. */

const h = vi.hoisted(() => ({
  session: null as { user: { id: string; email: string; name: string; role?: string } } | null,
  setRole: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/server/auth/auth", () => ({ auth: { api: { getSession: async () => h.session } } }));
vi.mock("@/server/db/prisma", () => ({ prisma: {} }));
vi.mock("@/server/services/admin-user.service", () => ({
  adminUserService: { setRole: h.setRole },
}));

import { PATCH } from "./route";

const ctx = { params: Promise.resolve({ id: "u2" }) };
function patchReq(body: unknown) {
  return new Request("http://localhost/api/admin/users/u2/role", {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  h.session = null;
  h.setRole.mockReset();
});

describe("PATCH /api/admin/users/:id/role", () => {
  it("401 when signed out and does not set role", async () => {
    const res = await PATCH(patchReq({ role: "Manager" }), ctx);
    expect(res.status).toBe(401);
    expect(h.setRole).not.toHaveBeenCalled();
  });

  it("403 for a non-manageRoles role (Director)", async () => {
    h.session = { user: { id: "u1", email: "d@desta.works", name: "D", role: "Director" } };
    const res = await PATCH(patchReq({ role: "Manager" }), ctx);
    expect(res.status).toBe(403);
    expect(h.setRole).not.toHaveBeenCalled();
  });

  it("200 for Owner — forwards id + role", async () => {
    h.session = { user: { id: "u1", email: "o@desta.works", name: "O", role: "Owner" } };
    h.setRole.mockResolvedValue({ id: "u2", role: "Manager" });
    const res = await PATCH(patchReq({ role: "Manager" }), ctx);
    expect(res.status).toBe(200);
    expect(h.setRole).toHaveBeenCalledWith("u2", "Manager");
  });

  it("422 on an invalid role", async () => {
    h.session = { user: { id: "u1", email: "o@desta.works", name: "O", role: "Owner" } };
    const res = await PATCH(patchReq({ role: "Superuser" }), ctx);
    expect(res.status).toBe(422);
    expect(h.setRole).not.toHaveBeenCalled();
  });
});
