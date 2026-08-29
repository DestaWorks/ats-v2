import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * GET /api/prospects/list — the guarded `/client-discovery` offset-page read: unauth -> 401; a
 * non-leadership role (Associate) -> 403; a leadership role -> 200 with the `ProspectListDTO`; a
 * bad `status` enum / `page` -> 422. `prospectService` is mocked; auth + zod run for real.
 */

const h = vi.hoisted(() => ({
  session: null as { user: { id: string; email: string; name: string; role?: string } } | null,
  list: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@destaworks/config/request-context", () => ({
  requestContext: () => ({ headers: async () => new Headers(), cookie: async () => undefined }),
}));
vi.mock("@destaworks/auth/auth", () => ({ auth: { api: { getSession: async () => h.session } } }));
vi.mock("@destaworks/db/memberships", async () => ({
  membershipReader: (
    await import("@destaworks/auth/testing/membership-double")
  ).singleTenantMembershipReader(() => h.session),
}));
vi.mock("@destaworks/db/prisma", () => ({ prisma: {} }));
vi.mock("@destaworks/application/prospect.service", () => ({ prospectService: { list: h.list } }));

import { GET } from "./route";

const PAGE = {
  prospects: [],
  total: 0,
  page: 1,
  pageSize: 25,
  totalPages: 1,
  hasPrev: false,
  hasNext: false,
};

function req(query = "") {
  return new Request(`http://localhost/api/prospects/list${query}`);
}

beforeEach(() => {
  h.session = null;
  h.list.mockReset();
  h.list.mockResolvedValue(PAGE);
});

describe("GET /api/prospects/list", () => {
  it("401 when signed out and does not read", async () => {
    const res = await GET(req(), undefined);
    expect(res.status).toBe(401);
    expect(h.list).not.toHaveBeenCalled();
  });

  it("403 for a non-leadership role (Associate) and does not read", async () => {
    h.session = { user: { id: "u2", email: "a@desta.works", name: "A", role: "Associate" } };
    const res = await GET(req(), undefined);
    expect(res.status).toBe(403);
    expect(h.list).not.toHaveBeenCalled();
  });

  it("200 with the page and forwards parsed filters for a leadership role (Manager)", async () => {
    h.session = { user: { id: "u1", email: "m@desta.works", name: "M", role: "Manager" } };
    const res = await GET(req("?status=Fresh Lead&source=Manual&search=sterling"), undefined);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(PAGE);
    const [filters] = h.list.mock.calls[0]!;
    expect(filters).toMatchObject({ status: "Fresh Lead", source: "Manual", search: "sterling" });
  });

  it("forwards ownerId/page (coerced) to the service", async () => {
    h.session = { user: { id: "u1", email: "m@desta.works", name: "M", role: "Manager" } };
    const res = await GET(req("?ownerId=u2&page=3"), undefined);
    expect(res.status).toBe(200);
    const [filters] = h.list.mock.calls[0]!;
    expect(filters).toMatchObject({ ownerId: "u2", page: 3 });
  });

  it("422 on a non-numeric page, nothing read", async () => {
    h.session = { user: { id: "u1", email: "m@desta.works", name: "M", role: "Manager" } };
    const res = await GET(req("?page=abc"), undefined);
    expect(res.status).toBe(422);
    expect(h.list).not.toHaveBeenCalled();
  });

  it("422 on a bad status enum", async () => {
    h.session = { user: { id: "u1", email: "m@desta.works", name: "M", role: "Manager" } };
    const res = await GET(req("?status=Bogus"), undefined);
    expect(res.status).toBe(422);
    expect(h.list).not.toHaveBeenCalled();
  });
});
