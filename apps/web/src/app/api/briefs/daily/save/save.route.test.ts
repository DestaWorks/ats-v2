import { describe, it, expect, beforeEach, vi } from "vitest";

/** POST /api/briefs/daily/save — guarded: unauth → 401, non-leadership → 403 (`viewReports`). */

const h = vi.hoisted(() => ({
  session: null as { user: { id: string; email: string; name: string; role?: string } } | null,
  saveDaily: vi.fn(),
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
  briefService: { saveDaily: h.saveDaily },
}));

import { POST } from "./route";

const body = {
  date: "2026-07-23",
  headline: "h",
  exceptions: [],
  yesterdayCheck: [],
  clientCards: [],
  perAssociate: [],
  teamPulse: "",
};

function req() {
  return new Request("http://localhost/api/briefs/daily/save", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  h.session = { user: { id: "u1", email: "u@desta.works", name: "U", role: "Owner" } };
  h.saveDaily.mockReset();
});

describe("POST /api/briefs/daily/save", () => {
  it("401 when signed out (no service call)", async () => {
    h.session = null;
    const res = await POST(req(), undefined);
    expect(res.status).toBe(401);
    expect(h.saveDaily).not.toHaveBeenCalled();
  });

  it("403 for a non-leadership role (no service call)", async () => {
    h.session = { user: { id: "u1", email: "a@desta.works", name: "A", role: "Associate" } };
    const res = await POST(req(), undefined);
    expect(res.status).toBe(403);
    expect(h.saveDaily).not.toHaveBeenCalled();
  });

  it("200 delegates to the service and returns the saved brief", async () => {
    const saved = { date: "2026-07-23", headline: "h" };
    h.saveDaily.mockResolvedValue(saved);
    const res = await POST(req(), undefined);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(saved);
    expect(h.saveDaily).toHaveBeenCalled();
  });
});
