import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * GET/POST /api/saved-icps — both gated `requireCapability("viewClientDiscovery")`: unauth ->
 * 401; a non-leadership role -> 403; a leadership role -> 200/201. `savedIcpService` is mocked;
 * auth runs for real.
 */

const h = vi.hoisted(() => ({
  session: null as { user: { id: string; email: string; name: string; role?: string } } | null,
  list: vi.fn(),
  create: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/server/auth/request-context", () => ({
  requestContext: () => ({ headers: async () => new Headers() }),
}));
vi.mock("@/server/auth/auth", () => ({ auth: { api: { getSession: async () => h.session } } }));
vi.mock("@/server/db/prisma", () => ({ prisma: {} }));
vi.mock("@/server/services/saved-icp.service", () => ({
  savedIcpService: { list: h.list, create: h.create },
}));

import { GET, POST } from "./route";

function postReq(body: unknown) {
  return new Request("http://localhost/api/saved-icps", {
    method: "POST",
    body: JSON.stringify(body),
  });
}
const getReq = () => new Request("http://localhost/api/saved-icps");

beforeEach(() => {
  h.session = null;
  h.list.mockReset();
  h.create.mockReset();
});

describe("GET /api/saved-icps", () => {
  it("401 when signed out and does not read", async () => {
    const res = await GET(getReq(), undefined);
    expect(res.status).toBe(401);
    expect(h.list).not.toHaveBeenCalled();
  });

  it("403 for a non-leadership role (Associate) and does not read", async () => {
    h.session = { user: { id: "u2", email: "a@desta.works", name: "A", role: "Associate" } };
    const res = await GET(getReq(), undefined);
    expect(res.status).toBe(403);
    expect(h.list).not.toHaveBeenCalled();
  });

  it("200 with the saved-ICP list for a leadership role (Director)", async () => {
    h.session = { user: { id: "u1", email: "d@desta.works", name: "D", role: "Director" } };
    h.list.mockResolvedValue([]);
    const res = await GET(getReq(), undefined);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ savedIcps: [] });
  });
});

describe("POST /api/saved-icps", () => {
  it("401 when signed out and does not create", async () => {
    const res = await POST(postReq({ name: "CT Behavioral Health" }), undefined);
    expect(res.status).toBe(401);
    expect(h.create).not.toHaveBeenCalled();
  });

  it("201 happy path for a leadership role (Manager)", async () => {
    h.session = { user: { id: "u1", email: "m@desta.works", name: "M", role: "Manager" } };
    h.create.mockResolvedValue({ id: "icp1", name: "CT Behavioral Health" });
    const res = await POST(postReq({ name: "CT Behavioral Health", state: "CT" }), undefined);
    expect(res.status).toBe(201);
    expect((await res.json()).savedIcp.id).toBe("icp1");
  });
});
