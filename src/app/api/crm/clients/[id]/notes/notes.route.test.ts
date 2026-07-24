import { describe, it, expect, beforeEach, vi } from "vitest";

/** GET/POST /api/crm/clients/:id/notes — gated `viewCrm`. */

const h = vi.hoisted(() => ({
  session: null as { user: { id: string; email: string; name: string; role?: string } } | null,
  list: vi.fn(),
  create: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/server/auth/auth", () => ({ auth: { api: { getSession: async () => h.session } } }));
vi.mock("@/server/services/client-note.service", () => ({
  clientNoteService: { list: h.list, create: h.create },
}));

import { GET, POST } from "./route";

const ctx = { params: Promise.resolve({ id: "c1" }) };
const getReq = () => new Request("http://localhost/api/crm/clients/c1/notes");
const postReq = (body: unknown) =>
  new Request("http://localhost/api/crm/clients/c1/notes", {
    method: "POST",
    body: JSON.stringify(body),
  });

beforeEach(() => {
  h.session = null;
  h.list.mockReset();
  h.create.mockReset();
});

describe("GET /api/crm/clients/:id/notes", () => {
  it("401 when signed out", async () => {
    const res = await GET(getReq(), ctx);
    expect(res.status).toBe(401);
    expect(h.list).not.toHaveBeenCalled();
  });

  it("403 for a non-leadership role", async () => {
    h.session = { user: { id: "u1", email: "a@desta.works", name: "A", role: "Associate" } };
    const res = await GET(getReq(), ctx);
    expect(res.status).toBe(403);
  });

  it("200 for Owner, delegates to the service", async () => {
    h.session = { user: { id: "u1", email: "o@desta.works", name: "O", role: "Owner" } };
    h.list.mockResolvedValue([]);
    const res = await GET(getReq(), ctx);
    expect(res.status).toBe(200);
    expect(h.list).toHaveBeenCalledWith("c1");
  });
});

describe("POST /api/crm/clients/:id/notes", () => {
  it("401 when signed out", async () => {
    const res = await POST(postReq({ text: "Called to check in" }), ctx);
    expect(res.status).toBe(401);
    expect(h.create).not.toHaveBeenCalled();
  });

  it("201 for Owner, delegates to the service", async () => {
    h.session = { user: { id: "u1", email: "o@desta.works", name: "O", role: "Owner" } };
    const note = { id: "n1", clientId: "c1", text: "Called to check in" };
    h.create.mockResolvedValue(note);
    const res = await POST(postReq({ text: "Called to check in" }), ctx);
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ note });
  });
});
