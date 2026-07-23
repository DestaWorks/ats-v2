import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * GET/POST /api/admin/users — both gated `requireCapability("manageUsers")`: unauth → 401;
 * a non-manageUsers role (Director) → 403; Owner → 200/201. `adminUserService` is mocked.
 */

const h = vi.hoisted(() => ({
  session: null as { user: { id: string; email: string; name: string; role?: string } } | null,
  list: vi.fn(),
  create: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/server/auth/auth", () => ({ auth: { api: { getSession: async () => h.session } } }));
vi.mock("@/server/db/prisma", () => ({ prisma: {} }));
vi.mock("@/server/services/admin-user.service", () => ({
  adminUserService: { list: h.list, create: h.create },
}));

import { GET, POST } from "./route";

function postReq(body: unknown) {
  return new Request("http://localhost/api/admin/users", {
    method: "POST",
    body: JSON.stringify(body),
  });
}
const getReq = () => new Request("http://localhost/api/admin/users");

beforeEach(() => {
  h.session = null;
  h.list.mockReset();
  h.create.mockReset();
});

describe("GET /api/admin/users", () => {
  it("401 when signed out", async () => {
    const res = await GET(getReq(), undefined);
    expect(res.status).toBe(401);
    expect(h.list).not.toHaveBeenCalled();
  });

  it("403 for a non-manageUsers role (Director)", async () => {
    h.session = { user: { id: "u2", email: "d@desta.works", name: "D", role: "Director" } };
    const res = await GET(getReq(), undefined);
    expect(res.status).toBe(403);
    expect(h.list).not.toHaveBeenCalled();
  });

  it("200 for Owner", async () => {
    h.session = { user: { id: "u1", email: "o@desta.works", name: "O", role: "Owner" } };
    h.list.mockResolvedValue({ users: [], total: 0 });
    const res = await GET(getReq(), undefined);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ users: [], total: 0 });
  });
});

describe("POST /api/admin/users", () => {
  it("401 when signed out and does not create", async () => {
    const res = await POST(postReq({ name: "A", email: "a@b.com", role: "Associate" }), undefined);
    expect(res.status).toBe(401);
    expect(h.create).not.toHaveBeenCalled();
  });

  it("403 for a non-manageUsers role (Manager)", async () => {
    h.session = { user: { id: "u2", email: "m@desta.works", name: "M", role: "Manager" } };
    const res = await POST(postReq({ name: "A", email: "a@b.com", role: "Associate" }), undefined);
    expect(res.status).toBe(403);
    expect(h.create).not.toHaveBeenCalled();
  });

  it("201 for Owner — forwards the validated input", async () => {
    h.session = { user: { id: "u1", email: "o@desta.works", name: "O", role: "Owner" } };
    h.create.mockResolvedValue({ user: { id: "n1" }, generatedPassword: "pw123" });
    const res = await POST(postReq({ name: "A", email: "a@b.com", role: "Associate" }), undefined);
    expect(res.status).toBe(201);
    expect(h.create).toHaveBeenCalledWith(
      expect.objectContaining({ name: "A", email: "a@b.com", role: "Associate" }),
    );
  });

  it("422 on an invalid email", async () => {
    h.session = { user: { id: "u1", email: "o@desta.works", name: "O", role: "Owner" } };
    const res = await POST(
      postReq({ name: "A", email: "not-an-email", role: "Associate" }),
      undefined,
    );
    expect(res.status).toBe(422);
    expect(h.create).not.toHaveBeenCalled();
  });
});
