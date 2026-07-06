import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * GET /api/leads/list — the guarded `/sourcing` load-more: unauth → 401; a valid request → 200 with
 * the `LeadListDTO`; a malformed `cursor` → 400; a bad `status` enum → 422. `leadService` is mocked;
 * auth + zod + the cursor decode run for real.
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

const PAGE = { leads: [], count: 0, hasMore: false, nextCursor: null, total: 0 };

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

  it("decodes a valid cursor and passes it through", async () => {
    const cursor = Buffer.from(JSON.stringify(["2026-06-01T00:00:00.000Z", "l1"]), "utf8")
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    const res = await GET(req(`?cursor=${cursor}`), undefined);
    expect(res.status).toBe(200);
    const [filters] = h.list.mock.calls[0]!;
    expect(filters.cursor).toMatchObject({
      kind: "createdAt",
      value: "2026-06-01T00:00:00.000Z",
      id: "l1",
    });
  });

  it("400 on a malformed cursor, nothing read", async () => {
    const res = await GET(req("?cursor=not-a-real-cursor"), undefined);
    expect(res.status).toBe(400);
    expect(h.list).not.toHaveBeenCalled();
  });

  it("422 on a bad status enum", async () => {
    const res = await GET(req("?status=Bogus"), undefined);
    expect(res.status).toBe(422);
    expect(h.list).not.toHaveBeenCalled();
  });
});
