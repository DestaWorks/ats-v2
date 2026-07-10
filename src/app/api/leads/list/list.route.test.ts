import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * GET /api/leads/list — the guarded `/sourcing` offset-page read: unauth → 401; a valid request →
 * 200 with the `LeadListDTO`; a bad `status` enum / `page` → 422. `leadService` is mocked;
 * auth + zod run for real.
 */

const h = vi.hoisted(() => ({
  session: null as { user: { id: string; email: string; name: string; role?: string } } | null,
  list: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/server/auth/auth", () => ({ auth: { api: { getSession: async () => h.session } } }));
vi.mock("@/server/db/prisma", () => ({ prisma: {} }));
vi.mock("@/server/services/lead.service", () => ({ leadService: { list: h.list } }));

import { GET } from "./route";

const PAGE = {
  leads: [],
  total: 0,
  page: 1,
  pageSize: 25,
  totalPages: 1,
  hasPrev: false,
  hasNext: false,
};

function req(query = "") {
  return new Request(`http://localhost/api/leads/list${query}`);
}

beforeEach(() => {
  h.session = { user: { id: "u1", email: "u@desta.works", name: "U", role: "Associate" } };
  h.list.mockReset();
  h.list.mockResolvedValue(PAGE);
});

describe("GET /api/leads/list", () => {
  it("returns 401 when signed out and does not read", async () => {
    h.session = null;
    const res = await GET(req(), undefined);
    expect(res.status).toBe(401);
    expect(h.list).not.toHaveBeenCalled();
  });

  it("200 with the page and forwards parsed filters", async () => {
    const res = await GET(req("?status=Sourced&source=LinkedIn&search=jane"), undefined);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(PAGE);
    const [filters] = h.list.mock.calls[0]!;
    expect(filters).toMatchObject({ status: "Sourced", source: "LinkedIn", search: "jane" });
  });

  it("forwards clientId/ownerId/page (coerced) to the service", async () => {
    const res = await GET(req("?clientId=cl1&ownerId=u2&page=3"), undefined);
    expect(res.status).toBe(200);
    const [filters] = h.list.mock.calls[0]!;
    expect(filters).toMatchObject({ clientId: "cl1", ownerId: "u2", page: 3 });
  });

  it("422 on a non-numeric page, nothing read", async () => {
    const res = await GET(req("?page=abc"), undefined);
    expect(res.status).toBe(422);
    expect(h.list).not.toHaveBeenCalled();
  });

  it("422 on a bad status enum", async () => {
    const res = await GET(req("?status=Bogus"), undefined);
    expect(res.status).toBe(422);
    expect(h.list).not.toHaveBeenCalled();
  });
});
