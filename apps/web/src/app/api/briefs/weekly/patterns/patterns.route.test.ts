import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * POST /api/briefs/weekly/patterns — guarded: unauth → 401, non-leadership → 403 (`viewReports`).
 * Generate-only, never persisted.
 */

const h = vi.hoisted(() => ({
  session: null as { user: { id: string; email: string; name: string; role?: string } } | null,
  generatePatterns: vi.fn(),
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
vi.mock("@destaworks/application/brief.service", () => ({
  briefService: { generatePatterns: h.generatePatterns },
}));

import { POST } from "./route";

function req() {
  return new Request("http://localhost/api/briefs/weekly/patterns", {
    method: "POST",
    body: JSON.stringify({ weekStart: "2026-07-20", tz: -180 }),
  });
}

beforeEach(() => {
  h.session = { user: { id: "u1", email: "u@desta.works", name: "U", role: "Owner" } };
  h.generatePatterns.mockReset();
});

describe("POST /api/briefs/weekly/patterns", () => {
  it("401 when signed out (no service call)", async () => {
    h.session = null;
    const res = await POST(req(), undefined);
    expect(res.status).toBe(401);
    expect(h.generatePatterns).not.toHaveBeenCalled();
  });

  it("403 for a non-leadership role (no service call)", async () => {
    h.session = { user: { id: "u1", email: "a@desta.works", name: "A", role: "Associate" } };
    const res = await POST(req(), undefined);
    expect(res.status).toBe(403);
    expect(h.generatePatterns).not.toHaveBeenCalled();
  });

  it("200 delegates to the service and returns the patterns", async () => {
    const result = { patterns: [{ insight: "i", evidence: "e", action: "a" }] };
    h.generatePatterns.mockResolvedValue(result);
    const res = await POST(req(), undefined);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(result);
    expect(h.generatePatterns).toHaveBeenCalledWith({ weekStart: "2026-07-20", tz: -180 });
  });
});
