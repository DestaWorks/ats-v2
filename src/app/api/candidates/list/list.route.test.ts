import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * GET /api/candidates/list — the browse-list load-more endpoint: unauth → 401 (nothing fetched);
 * a bad filter → 422 (zod); a valid request → 200 with the `CandidateListDTO`. `sort` maps to the
 * repo orderBy; a malformed `cursor` → 400. `candidateService` is mocked (unit-tested separately);
 * auth + zod + the sort/cursor plumbing run for real off the mocked session.
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
  count: 0,
  capped: false,
  nextCursor: null,
  hasMore: false,
  total: 0,
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
    const res = await GET(req("?sort=fit"), undefined);
    expect(res.status).toBe(422);
    expect(h.listCandidates).not.toHaveBeenCalled();
  });

  it("200 and maps sort=oldest → createdAt_asc, forwards chip filters", async () => {
    const res = await GET(req("?sort=oldest&mine=1&overdue=1"), undefined);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(LIST);
    const [filters] = h.listCandidates.mock.calls[0]!;
    expect(filters).toMatchObject({ sort: "createdAt_asc", mine: true, overdue: true });
  });

  it("400 on a malformed cursor", async () => {
    const res = await GET(req("?cursor=garbage!!!"), undefined);
    expect(res.status).toBe(400);
    expect(h.listCandidates).not.toHaveBeenCalled();
  });

  it("decodes a valid cursor and forwards it", async () => {
    const cursor = Buffer.from(JSON.stringify(["2026-06-01T00:00:00.000Z", "c1"])).toString(
      "base64url",
    );
    const res = await GET(req(`?cursor=${cursor}`), undefined);
    expect(res.status).toBe(200);
    const [filters] = h.listCandidates.mock.calls[0]!;
    expect(filters.cursor).toMatchObject({
      kind: "createdAt",
      value: "2026-06-01T00:00:00.000Z",
      id: "c1",
    });
  });
});
