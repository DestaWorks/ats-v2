import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * POST /api/prospects/bulk — gated `requireCapability("viewClientDiscovery")`: unauth -> 401; a
 * non-leadership role -> 403; a leadership role -> 200 `{ affected, skipped }`; an unknown
 * `action` -> 422. `prospectService` is mocked; auth + zod run for real.
 */

const h = vi.hoisted(() => ({
  session: null as { user: { id: string; email: string; name: string; role?: string } } | null,
  bulkAction: vi.fn(),
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
vi.mock("@destaworks/db/prisma", () => ({ prisma: {} }));
vi.mock("@destaworks/application/prospect.service", () => ({
  prospectService: { bulkAction: h.bulkAction },
}));

import { POST } from "./route";

function postReq(body: unknown) {
  return new Request("http://localhost/api/prospects/bulk", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  h.session = null;
  h.bulkAction.mockReset();
});

describe("POST /api/prospects/bulk", () => {
  it("401 when signed out and does not act", async () => {
    const res = await POST(postReq({ action: "delete", ids: ["p1"] }), undefined);
    expect(res.status).toBe(401);
    expect(h.bulkAction).not.toHaveBeenCalled();
  });

  it("403 for a non-leadership role (Associate) and does not act", async () => {
    h.session = { user: { id: "u2", email: "a@desta.works", name: "A", role: "Associate" } };
    const res = await POST(postReq({ action: "delete", ids: ["p1"] }), undefined);
    expect(res.status).toBe(403);
    expect(h.bulkAction).not.toHaveBeenCalled();
  });

  it("200 { affected, skipped } for a leadership role (Manager)", async () => {
    h.session = { user: { id: "u1", email: "m@desta.works", name: "M", role: "Manager" } };
    h.bulkAction.mockResolvedValue({ affected: 2, skipped: 0 });
    const res = await POST(postReq({ action: "delete", ids: ["p1", "p2"] }), undefined);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ affected: 2, skipped: 0 });
  });

  it("422 on an unknown action, nothing acted on", async () => {
    h.session = { user: { id: "u1", email: "m@desta.works", name: "M", role: "Manager" } };
    const res = await POST(postReq({ action: "bogus", ids: ["p1"] }), undefined);
    expect(res.status).toBe(422);
    expect(h.bulkAction).not.toHaveBeenCalled();
  });
});
