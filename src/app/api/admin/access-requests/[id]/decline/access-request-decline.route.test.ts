import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * POST /api/admin/access-requests/:id/decline — gated `manageAccessRequests`: unauth → 401;
 * non-manageAccessRequests → 403; Owner → 200.
 */

const h = vi.hoisted(() => ({
  session: null as { user: { id: string; email: string; name: string; role?: string } } | null,
  decline: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/server/auth/auth", () => ({ auth: { api: { getSession: async () => h.session } } }));
vi.mock("@/server/db/prisma", () => ({ prisma: {} }));
vi.mock("@/server/services/access-request.service", () => ({
  accessRequestService: { decline: h.decline },
}));

import { POST } from "./route";

const ctx = { params: Promise.resolve({ id: "r1" }) };
const postReq = () =>
  new Request("http://localhost/api/admin/access-requests/r1/decline", { method: "POST" });

beforeEach(() => {
  h.session = null;
  h.decline.mockReset();
});

describe("POST /api/admin/access-requests/:id/decline", () => {
  it("401 when signed out and does not decline", async () => {
    const res = await POST(postReq(), ctx);
    expect(res.status).toBe(401);
    expect(h.decline).not.toHaveBeenCalled();
  });

  it("403 for a non-manageAccessRequests role (Manager)", async () => {
    h.session = { user: { id: "u1", email: "m@desta.works", name: "M", role: "Manager" } };
    const res = await POST(postReq(), ctx);
    expect(res.status).toBe(403);
    expect(h.decline).not.toHaveBeenCalled();
  });

  it("200 for Owner", async () => {
    h.session = { user: { id: "u1", email: "o@desta.works", name: "O", role: "Owner" } };
    h.decline.mockResolvedValue(undefined);
    const res = await POST(postReq(), ctx);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, id: "r1" });
    expect(h.decline).toHaveBeenCalledWith("r1");
  });
});
