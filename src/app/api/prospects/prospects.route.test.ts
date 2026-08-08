import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * POST /api/prospects — gated `requireCapability("viewClientDiscovery")`: unauth -> 401; a
 * non-leadership role (Associate) -> 403; a leadership role (Director) -> 201. `prospectService`
 * is mocked; auth runs for real.
 */

const h = vi.hoisted(() => ({
  session: null as { user: { id: string; email: string; name: string; role?: string } } | null,
  create: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/server/auth/auth", () => ({ auth: { api: { getSession: async () => h.session } } }));
vi.mock("@/server/db/prisma", () => ({ prisma: {} }));
vi.mock("@/server/services/prospect.service", () => ({
  prospectService: { create: h.create },
}));

import { POST } from "./route";

function postReq(body: unknown) {
  return new Request("http://localhost/api/prospects", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  h.session = null;
  h.create.mockReset();
});

describe("POST /api/prospects", () => {
  it("401 when signed out and does not create", async () => {
    const res = await POST(postReq({ practiceName: "Sterling Institute" }), undefined);
    expect(res.status).toBe(401);
    expect(h.create).not.toHaveBeenCalled();
  });

  it("403 for a non-leadership role (Associate) and does not create", async () => {
    h.session = { user: { id: "u2", email: "a@desta.works", name: "A", role: "Associate" } };
    const res = await POST(postReq({ practiceName: "Sterling Institute" }), undefined);
    expect(res.status).toBe(403);
    expect(h.create).not.toHaveBeenCalled();
  });

  it("201 happy path for a leadership role (Director)", async () => {
    h.session = { user: { id: "u1", email: "d@desta.works", name: "D", role: "Director" } };
    h.create.mockResolvedValue({ id: "p1", practiceName: "Sterling Institute" });
    const res = await POST(postReq({ practiceName: "Sterling Institute" }), undefined);
    expect(res.status).toBe(201);
    expect(h.create).toHaveBeenCalledWith(
      expect.objectContaining({ practiceName: "Sterling Institute" }),
      expect.objectContaining({ id: "u1" }),
    );
    expect((await res.json()).prospect.id).toBe("p1");
  });

  it("422 when practiceName is missing (required)", async () => {
    h.session = { user: { id: "u1", email: "d@desta.works", name: "D", role: "Director" } };
    const res = await POST(postReq({}), undefined);
    expect(res.status).toBe(422);
    expect(h.create).not.toHaveBeenCalled();
  });

  it("422 when the body carries an unknown key (strict, e.g. a client-seeded status)", async () => {
    h.session = { user: { id: "u1", email: "d@desta.works", name: "D", role: "Director" } };
    const res = await POST(
      postReq({ practiceName: "Sterling Institute", status: "Client" }),
      undefined,
    );
    expect(res.status).toBe(422);
    expect(h.create).not.toHaveBeenCalled();
  });
});
