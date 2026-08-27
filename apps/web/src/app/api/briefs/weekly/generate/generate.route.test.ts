import { describe, it, expect, beforeEach, vi } from "vitest";

/** POST /api/briefs/weekly/generate — guarded: unauth → 401, non-leadership → 403 (`viewReports`). */

const h = vi.hoisted(() => ({
  session: null as { user: { id: string; email: string; name: string; role?: string } } | null,
  generateWeekly: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@destaworks/config/request-context", () => ({
  requestContext: () => ({ headers: async () => new Headers() }),
}));
vi.mock("@destaworks/auth/auth", () => ({ auth: { api: { getSession: async () => h.session } } }));
vi.mock("@destaworks/application/brief.service", () => ({
  briefService: { generateWeekly: h.generateWeekly },
}));

import { POST } from "./route";

function req() {
  return new Request("http://localhost/api/briefs/weekly/generate", {
    method: "POST",
    body: JSON.stringify({ weekStart: "2026-07-20", tz: -180 }),
  });
}

beforeEach(() => {
  h.session = { user: { id: "u1", email: "u@desta.works", name: "U", role: "Owner" } };
  h.generateWeekly.mockReset();
});

describe("POST /api/briefs/weekly/generate", () => {
  it("401 when signed out (no service call)", async () => {
    h.session = null;
    const res = await POST(req(), undefined);
    expect(res.status).toBe(401);
    expect(h.generateWeekly).not.toHaveBeenCalled();
  });

  it("403 for a non-leadership role (no service call)", async () => {
    h.session = { user: { id: "u1", email: "a@desta.works", name: "A", role: "Associate" } };
    const res = await POST(req(), undefined);
    expect(res.status).toBe(403);
    expect(h.generateWeekly).not.toHaveBeenCalled();
  });

  it("200 delegates to the service and returns the draft", async () => {
    const draft = { headline: "h" };
    h.generateWeekly.mockResolvedValue(draft);
    const res = await POST(req(), undefined);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(draft);
    expect(h.generateWeekly).toHaveBeenCalledWith({ weekStart: "2026-07-20", tz: -180 });
  });
});
