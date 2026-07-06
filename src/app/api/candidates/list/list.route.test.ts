import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * GET /api/candidates/list — the browse-list JSON endpoint: unauth → 401 (nothing fetched); a bad
 * filter → 422 (zod); a valid request → 200 with the offset `CandidateListDTO`. The server resolves
 * everything, so the route just forwards the parsed query (filters + `hot` + `sort` + `page`) to the
 * service. `candidateService` is mocked (unit-tested separately); auth + zod run for real.
 */

const h = vi.hoisted(() => ({
  session: null as { user: { id: string; email: string; name: string; role?: string } } | null,
  listCandidates: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/server/auth/auth", () => ({ auth: { api: { getSession: async () => h.session } } }));
vi.mock("@/server/db/prisma", () => ({ prisma: {} }));
vi.mock("@/server/services/candidate.service", () => ({
  candidateService: { listCandidates: h.listCandidates },
}));

import { GET } from "./route";

const LIST = {
  candidates: [],
  total: 0,
  page: 1,
  pageSize: 25,
  totalPages: 1,
  hasPrev: false,
  hasNext: false,
};

function req(query = "") {
  return new Request(`http://localhost/api/candidates/list${query}`);
}

beforeEach(() => {
  h.session = { user: { id: "u1", email: "u@desta.works", name: "U", role: "Associate" } };
  h.listCandidates.mockReset().mockResolvedValue(LIST);
});

describe("GET /api/candidates/list", () => {
  it("401 when signed out and does not read the list", async () => {
    h.session = null;
    const res = await GET(req(), undefined);
    expect(res.status).toBe(401);
    expect(h.listCandidates).not.toHaveBeenCalled();
  });

  it("422 for an invalid sort value", async () => {
    const res = await GET(req("?sort=nope"), undefined);
    expect(res.status).toBe(422);
    expect(h.listCandidates).not.toHaveBeenCalled();
  });

  it("200 and forwards sort=oldest, chip filters, hot, and page", async () => {
    const res = await GET(req("?sort=oldest&mine=1&overdue=1&hot=1&page=3"), undefined);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(LIST);
    const [filters] = h.listCandidates.mock.calls[0]!;
    expect(filters).toMatchObject({ sort: "oldest", mine: true, overdue: true, hot: true, page: 3 });
  });

  it("accepts sort=fit (the computed fit-score sort)", async () => {
    const res = await GET(req("?sort=fit"), undefined);
    expect(res.status).toBe(200);
    const [filters] = h.listCandidates.mock.calls[0]!;
    expect(filters.sort).toBe("fit");
  });

  it("defaults to sort=newest, page 1 when unspecified", async () => {
    const res = await GET(req(), undefined);
    expect(res.status).toBe(200);
    const [filters] = h.listCandidates.mock.calls[0]!;
    expect(filters).toMatchObject({ sort: "newest", page: 1 });
  });

  it("coerces a non-numeric page to 1", async () => {
    await GET(req("?page=abc"), undefined);
    const [filters] = h.listCandidates.mock.calls[0]!;
    expect(filters.page).toBe(1);
  });
});
