import { describe, it, expect, beforeEach, vi } from "vitest";

/** POST /api/targets/suggest — gated `viewReports` (same as `dailyService.setTarget`'s LEADERSHIP-only gate). */

const h = vi.hoisted(() => ({
  session: null as { user: { id: string; email: string; name: string; role?: string } } | null,
  suggestTargets: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@destaworks/config/request-context", () => ({
  requestContext: () => ({ headers: async () => new Headers() }),
}));
vi.mock("@destaworks/auth/auth", () => ({ auth: { api: { getSession: async () => h.session } } }));
vi.mock("@destaworks/application/brief.service", () => ({
  briefService: { suggestTargets: h.suggestTargets },
}));

import { POST } from "./route";

function req() {
  return new Request("http://localhost/api/targets/suggest", {
    method: "POST",
    body: JSON.stringify({ userId: "u2", date: "2026-07-23" }),
  });
}

beforeEach(() => {
  h.session = null;
  h.suggestTargets.mockReset();
});

describe("POST /api/targets/suggest", () => {
  it("401 when signed out", async () => {
    const res = await POST(req(), undefined);
    expect(res.status).toBe(401);
    expect(h.suggestTargets).not.toHaveBeenCalled();
  });

  it("403 for a non-leadership role (Associate has no viewReports)", async () => {
    h.session = { user: { id: "u1", email: "a@desta.works", name: "A", role: "Associate" } };
    const res = await POST(req(), undefined);
    expect(res.status).toBe(403);
    expect(h.suggestTargets).not.toHaveBeenCalled();
  });

  it("200 for Owner, delegates to the service", async () => {
    h.session = { user: { id: "u1", email: "o@desta.works", name: "O", role: "Owner" } };
    const suggestion = {
      sourcing: 25,
      outreach: 25,
      atsCleanup: 5,
      inbound: 0,
      screens: 0,
      rationale: "r",
    };
    h.suggestTargets.mockResolvedValue(suggestion);
    const res = await POST(req(), undefined);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(suggestion);
    expect(h.suggestTargets).toHaveBeenCalledWith({ userId: "u2", date: "2026-07-23" });
  });
});
