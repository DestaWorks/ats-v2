import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * GET /api/candidates — the guarded board read: unauth → 401 (nothing fetched); a bad query param
 * → 422 (zod); a valid request → 200 with the `BoardResponse`. `candidateService.listBoard` is
 * mocked (the service is unit-tested separately); auth runs for real off the mocked session.
 */

const h = vi.hoisted(() => ({
  session: null as { user: { id: string; email: string; name: string; role?: string } } | null,
  listBoard: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/server/auth/auth", () => ({ auth: { api: { getSession: async () => h.session } } }));
vi.mock("@/server/db/prisma", () => ({ prisma: {} }));
vi.mock("@/server/services/candidate.service", () => ({
  candidateService: { listBoard: h.listBoard },
}));

import { GET } from "./route";

const BOARD = { columns: [], terminal: [], meta: { total: 0, active: 0, overdue: 0, stuck: 0 } };

function req(query = "") {
  return new Request(`http://localhost/api/candidates${query}`);
}

beforeEach(() => {
  h.session = { user: { id: "u1", email: "u@desta.works", name: "U", role: "Associate" } };
  h.listBoard.mockReset();
  h.listBoard.mockResolvedValue(BOARD);
});

describe("GET /api/candidates", () => {
  it("returns 401 when signed out and does not read the board", async () => {
    h.session = null;
    const res = await GET(req(), undefined);
    expect(res.status).toBe(401);
    expect(h.listBoard).not.toHaveBeenCalled();
  });

  it("returns 422 for an invalid query param", async () => {
    const res = await GET(req("?track=NotATrack"), undefined);
    expect(res.status).toBe(422);
    expect(h.listBoard).not.toHaveBeenCalled();
  });

  it("returns 200 with the board and forwards parsed filters", async () => {
    const res = await GET(req("?track=Operations&includeTerminal=1"), undefined);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(BOARD);
    const [filters, , opts] = h.listBoard.mock.calls[0]!;
    expect(filters).toMatchObject({ track: "Operations" });
    expect(opts).toEqual({ includeTerminal: true });
  });
});
