import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * POST /api/admin/users/:id/reset-password — gated `manageUsers`: unauth → 401;
 * non-manageUsers → 403; Owner → 200.
 */

const h = vi.hoisted(() => ({
  session: null as { user: { id: string; email: string; name: string; role?: string } } | null,
  resetPassword: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/server/auth/auth", () => ({ auth: { api: { getSession: async () => h.session } } }));
vi.mock("@/server/db/prisma", () => ({ prisma: {} }));
vi.mock("@/server/services/admin-user.service", () => ({
  adminUserService: { resetPassword: h.resetPassword },
}));

import { POST } from "./route";

const ctx = { params: Promise.resolve({ id: "u2" }) };
const postReq = () =>
  new Request("http://localhost/api/admin/users/u2/reset-password", { method: "POST" });

beforeEach(() => {
  h.session = null;
  h.resetPassword.mockReset();
});

describe("POST /api/admin/users/:id/reset-password", () => {
  it("401 when signed out and does not reset", async () => {
    const res = await POST(postReq(), ctx);
    expect(res.status).toBe(401);
    expect(h.resetPassword).not.toHaveBeenCalled();
  });

  it("403 for a non-manageUsers role (Director)", async () => {
    h.session = { user: { id: "u1", email: "d@desta.works", name: "D", role: "Director" } };
    const res = await POST(postReq(), ctx);
    expect(res.status).toBe(403);
    expect(h.resetPassword).not.toHaveBeenCalled();
  });

  it("200 for Owner — returns the generated password", async () => {
    h.session = { user: { id: "u1", email: "o@desta.works", name: "O", role: "Owner" } };
    h.resetPassword.mockResolvedValue({ generatedPassword: "newpw123" });
    const res = await POST(postReq(), ctx);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ generatedPassword: "newpw123" });
    expect(h.resetPassword).toHaveBeenCalledWith("u2");
  });
});
