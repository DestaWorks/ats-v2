import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * GET /api/discover/coverage-gaps/supply — guarded: unauth → 401 (no service call); validates
 * `credential`/`state` query params; forwards to `discoverService.supplyForCombo`.
 */

const h = vi.hoisted(() => ({
  session: null as { user: { id: string; email: string; name: string; role?: string } } | null,
  supplyForCombo: vi.fn(),
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
vi.mock("@destaworks/application/discover.service", () => ({
  discoverService: { supplyForCombo: h.supplyForCombo },
}));

import { GET } from "./route";

const req = (qs: string) => new Request(`http://localhost/api/discover/coverage-gaps/supply${qs}`);

beforeEach(() => {
  h.session = { user: { id: "u1", email: "u@desta.works", name: "U", role: "Associate" } };
  h.supplyForCombo.mockReset();
});

describe("GET /api/discover/coverage-gaps/supply", () => {
  it("401 when signed out (no service call)", async () => {
    h.session = null;
    const res = await GET(req("?credential=PMHNP&state=CT"), undefined);
    expect(res.status).toBe(401);
    expect(h.supplyForCombo).not.toHaveBeenCalled();
  });

  it("422 on a missing state", async () => {
    const res = await GET(req("?credential=PMHNP"), undefined);
    expect(res.status).toBe(422);
    expect(h.supplyForCombo).not.toHaveBeenCalled();
  });

  it("422 on an invalid (non-US-state) state", async () => {
    const res = await GET(req("?credential=PMHNP&state=ZZ"), undefined);
    expect(res.status).toBe(422);
  });

  it("200 forwards the validated query to the service", async () => {
    h.supplyForCombo.mockResolvedValue({ supply: 12 });
    const res = await GET(req("?credential=PMHNP&state=CT"), undefined);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ supply: 12 });
    expect(h.supplyForCombo).toHaveBeenCalledWith(
      { credential: "PMHNP", state: "CT" },
      expect.objectContaining({ user: expect.objectContaining({ id: "u1" }) }),
    );
  });
});
