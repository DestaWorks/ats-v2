import { describe, it, expect, beforeEach, vi } from "vitest";

/** POST /api/admin/users/:id/unban — gated `manageUsers`: unauth → 401; non-manageUsers → 403; Owner → 200. */

const h = vi.hoisted(() => ({
  session: null as { user: { id: string; email: string; name: string; role?: string } } | null,
  unban: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/server/auth/auth", () => ({ auth: { api: { getSession: async () => h.session } } }));
vi.mock("@/server/db/prisma", () => ({ prisma: {} }));
vi.mock("@/server/services/admin-user.service", () => ({ adminUserService: { unban: h.unban } }));

import { POST } from "./route";

const ctx = { params: Promise.resolve({ id: "u2" }) };
const postReq = () => new Request("http://localhost/api/admin/users/u2/unban", { method: "POST" });

beforeEach(() => {
  h.session = null;
  h.unban.mockReset();
});

describe("POST /api/admin/users/:id/unban", () => {
  it("401 when signed out and does not unban", async () => {
    const res = await POST(postReq(), ctx);
    expect(res.status).toBe(401);
    expect(h.unban).not.toHaveBeenCalled();
  });

  it("403 for a non-manageUsers role (Screener)", async () => {
    h.session = { user: { id: "u1", email: "s@desta.works", name: "S", role: "Screener" } };
    const res = await POST(postReq(), ctx);
    expect(res.status).toBe(403);
    expect(h.unban).not.toHaveBeenCalled();
  });

  it("200 for Owner", async () => {
    h.session = { user: { id: "u1", email: "o@desta.works", name: "O", role: "Owner" } };
    h.unban.mockResolvedValue({ id: "u2", banned: false });
    const res = await POST(postReq(), ctx);
    expect(res.status).toBe(200);
    expect(h.unban).toHaveBeenCalledWith("u2");
  });
});
