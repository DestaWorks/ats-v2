import { describe, it, expect, beforeEach, vi } from "vitest";

/** DELETE /api/admin/users/:id — gated `manageUsers`: unauth → 401; non-manageUsers → 403; Owner → 200. */

const h = vi.hoisted(() => ({
  session: null as { user: { id: string; email: string; name: string; role?: string } } | null,
  remove: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/server/auth/auth", () => ({ auth: { api: { getSession: async () => h.session } } }));
vi.mock("@/server/db/prisma", () => ({ prisma: {} }));
vi.mock("@/server/services/admin-user.service", () => ({
  adminUserService: { remove: h.remove },
}));

import { DELETE } from "./route";

const ctx = { params: Promise.resolve({ id: "u2" }) };
const deleteReq = () => new Request("http://localhost/api/admin/users/u2", { method: "DELETE" });

beforeEach(() => {
  h.session = null;
  h.remove.mockReset();
});

describe("DELETE /api/admin/users/:id", () => {
  it("401 when signed out and does not remove", async () => {
    const res = await DELETE(deleteReq(), ctx);
    expect(res.status).toBe(401);
    expect(h.remove).not.toHaveBeenCalled();
  });

  it("403 for a non-manageUsers role (Screener)", async () => {
    h.session = { user: { id: "u1", email: "s@desta.works", name: "S", role: "Screener" } };
    const res = await DELETE(deleteReq(), ctx);
    expect(res.status).toBe(403);
    expect(h.remove).not.toHaveBeenCalled();
  });

  it("200 for Owner", async () => {
    h.session = { user: { id: "u1", email: "o@desta.works", name: "O", role: "Owner" } };
    h.remove.mockResolvedValue(undefined);
    const res = await DELETE(deleteReq(), ctx);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, id: "u2" });
    expect(h.remove).toHaveBeenCalledWith("u2");
  });
});
