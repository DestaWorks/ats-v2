import { describe, it, expect, vi } from "vitest";

/**
 * GET /api/credentials/overview — the guarded leadership-dashboard read: unauth → 401; a
 * non-`viewCredentials` role (Associate) → 403; a leadership role (Owner) → 200 with the
 * service's result. `credentialsIntelligenceService` is mocked (unit-tested separately); auth
 * runs for real.
 */

const h = vi.hoisted(() => ({
  session: null as { user: { id: string; email: string; name: string; role?: string } } | null,
  overview: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/server/auth/auth", () => ({ auth: { api: { getSession: async () => h.session } } }));
vi.mock("@/server/db/prisma", () => ({ prisma: {} }));
vi.mock("@/server/services/credentials-intelligence.service", () => ({
  credentialsIntelligenceService: { overview: h.overview },
}));

import { GET } from "./route";

const OVERVIEW = {
  stats: { total: 0, active: 0, unverified: 0, expired: 0, expiringSoon: 0, nlcCompact: 0 },
  matrix: { states: [], credentials: [], cells: [] },
  gapAnalysis: [],
  nlcHolders: [],
};

function req() {
  return new Request("http://localhost/api/credentials/overview");
}

describe("GET /api/credentials/overview", () => {
  it("401 when signed out and does not read", async () => {
    h.session = null;
    const res = await GET(req(), undefined);
    expect(res.status).toBe(401);
    expect(h.overview).not.toHaveBeenCalled();
  });

  it("403 for a non-viewCredentials role (Associate) and reads nothing", async () => {
    h.session = { user: { id: "u2", email: "a@desta.works", name: "A", role: "Associate" } };
    const res = await GET(req(), undefined);
    expect(res.status).toBe(403);
    expect(h.overview).not.toHaveBeenCalled();
  });

  it("200 with the overview for a leadership role (Owner)", async () => {
    h.session = { user: { id: "u1", email: "o@desta.works", name: "O", role: "Owner" } };
    h.overview.mockResolvedValue(OVERVIEW);
    const res = await GET(req(), undefined);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(OVERVIEW);
  });
});
