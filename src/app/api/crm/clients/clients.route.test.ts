import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * GET/POST /api/crm/clients — both gated `requireCapability("viewCrm")`: unauth → 401; a
 * non-viewCrm role (Associate) → 403; a leadership role (Director) → 200/201.
 * `clientService` is mocked; auth runs for real.
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
vi.mock("@/server/services/client.service", () => ({
  clientService: { list: h.list, create: h.create },
}));

import { GET, POST } from "./route";

function postReq(body: unknown) {
  return new Request("http://localhost/api/crm/clients", {
    method: "POST",
    body: JSON.stringify(body),
  });
}
const getReq = () => new Request("http://localhost/api/crm/clients");

beforeEach(() => {
  h.session = null;
  h.list.mockReset();
  h.create.mockReset();
});

describe("GET /api/crm/clients", () => {
  it("401 when signed out and does not read", async () => {
    const res = await GET(getReq(), undefined);
    expect(res.status).toBe(401);
    expect(h.list).not.toHaveBeenCalled();
  });

  it("403 for a non-viewCrm role (Associate) and reads nothing", async () => {
    h.session = { user: { id: "u2", email: "a@desta.works", name: "A", role: "Associate" } };
    const res = await GET(getReq(), undefined);
    expect(res.status).toBe(403);
    expect(h.list).not.toHaveBeenCalled();
  });

  it("200 with the client list for a leadership role (Director)", async () => {
    h.session = { user: { id: "u1", email: "d@desta.works", name: "D", role: "Director" } };
    h.list.mockResolvedValue({ clients: [] });
    const res = await GET(getReq(), undefined);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ clients: [] });
  });
});

describe("POST /api/crm/clients", () => {
  it("401 when signed out and does not create", async () => {
    const res = await POST(postReq({ name: "Acme" }), undefined);
    expect(res.status).toBe(401);
    expect(h.create).not.toHaveBeenCalled();
  });

  it("403 for a non-viewCrm role (Screener)", async () => {
    h.session = { user: { id: "u2", email: "s@desta.works", name: "S", role: "Screener" } };
    const res = await POST(postReq({ name: "Acme" }), undefined);
    expect(res.status).toBe(403);
    expect(h.create).not.toHaveBeenCalled();
  });

  it("201 for a leadership role (Owner) — forwards the validated input", async () => {
    h.session = { user: { id: "u1", email: "o@desta.works", name: "O", role: "Owner" } };
    h.create.mockResolvedValue({ id: "c1", name: "Acme" });
    const res = await POST(postReq({ name: "Acme" }), undefined);
    expect(res.status).toBe(201);
    expect(h.create).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Acme" }),
      expect.objectContaining({ id: "u1" }),
    );
  });

  it("422 on an empty name", async () => {
    h.session = { user: { id: "u1", email: "o@desta.works", name: "O", role: "Owner" } };
    const res = await POST(postReq({ name: "" }), undefined);
    expect(res.status).toBe(422);
    expect(h.create).not.toHaveBeenCalled();
  });
});
