import { describe, it, expect, beforeEach, vi } from "vitest";

/** POST /api/briefs/weekly/save — guarded: unauth → 401, non-leadership → 403 (`viewReports`). */

const h = vi.hoisted(() => ({
  session: null as { user: { id: string; email: string; name: string; role?: string } } | null,
  saveWeekly: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@destaworks/config/request-context", () => ({
  requestContext: () => ({ headers: async () => new Headers() }),
}));
vi.mock("@destaworks/auth/auth", () => ({ auth: { api: { getSession: async () => h.session } } }));
vi.mock("@destaworks/application/brief.service", () => ({
  briefService: { saveWeekly: h.saveWeekly },
}));

import { POST } from "./route";

const body = {
  weekStart: "2026-07-20",
  headline: "h",
  kpiNarrative: "",
  clientCards: [],
  perAssociate: [],
  lastWeekCheck: [],
  decisions: [],
  highlights: "",
  blockers: "",
};

function req() {
  return new Request("http://localhost/api/briefs/weekly/save", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  h.session = { user: { id: "u1", email: "u@desta.works", name: "U", role: "Owner" } };
  h.saveWeekly.mockReset();
});

describe("POST /api/briefs/weekly/save", () => {
  it("401 when signed out (no service call)", async () => {
    h.session = null;
    const res = await POST(req(), undefined);
    expect(res.status).toBe(401);
    expect(h.saveWeekly).not.toHaveBeenCalled();
  });

  it("403 for a non-leadership role (no service call)", async () => {
    h.session = { user: { id: "u1", email: "a@desta.works", name: "A", role: "Associate" } };
    const res = await POST(req(), undefined);
    expect(res.status).toBe(403);
    expect(h.saveWeekly).not.toHaveBeenCalled();
  });

  it("200 delegates to the service and returns the saved brief", async () => {
    const saved = { weekStart: "2026-07-20", headline: "h" };
    h.saveWeekly.mockResolvedValue(saved);
    const res = await POST(req(), undefined);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(saved);
    expect(h.saveWeekly).toHaveBeenCalled();
  });
});
