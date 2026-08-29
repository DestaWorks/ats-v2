import { describe, it, expect, beforeEach, vi } from "vitest";
import { AppError } from "@destaworks/integrations/http/app-error";

/**
 * POST /api/admin/portal/requests/:id/approve — gated `configureClientPortal`: unauth → 401;
 * non-configureClientPortal → 403; Owner → 200; a resolved/missing request → NOT_FOUND/CONFLICT
 * mapped through `apiHandler`.
 */

const h = vi.hoisted(() => ({
  session: null as { user: { id: string; email: string; name: string; role?: string } } | null,
  approve: vi.fn(),
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
vi.mock("@destaworks/application/portal-access-request.service", () => ({
  portalAccessRequestService: { approve: h.approve },
}));

import { POST } from "./route";

const ctx = { params: Promise.resolve({ id: "r1" }) };
function postReq(body: unknown) {
  return new Request("http://localhost/api/admin/portal/requests/r1/approve", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  h.session = null;
  h.approve.mockReset();
});

describe("POST /api/admin/portal/requests/:id/approve", () => {
  it("401 when signed out and does not approve", async () => {
    const res = await POST(postReq({ clientId: "cl1" }), ctx);
    expect(res.status).toBe(401);
    expect(h.approve).not.toHaveBeenCalled();
  });

  it("403 for a non-configureClientPortal role (Manager)", async () => {
    h.session = { user: { id: "u1", email: "m@desta.works", name: "M", role: "Manager" } };
    const res = await POST(postReq({ clientId: "cl1" }), ctx);
    expect(res.status).toBe(403);
    expect(h.approve).not.toHaveBeenCalled();
  });

  it("200 for Owner — forwards id + validated input", async () => {
    h.session = { user: { id: "u1", email: "o@desta.works", name: "O", role: "Owner" } };
    h.approve.mockResolvedValue({ contact: { id: "c1" }, token: "rawtoken" });
    const res = await POST(postReq({ clientId: "cl1" }), ctx);
    expect(res.status).toBe(200);
    expect(h.approve).toHaveBeenCalledWith(
      "r1",
      expect.objectContaining({ clientId: "cl1" }),
      expect.objectContaining({ user: expect.objectContaining({ id: "u1" }) }),
    );
  });

  it("maps a service CONFLICT to 409", async () => {
    h.session = { user: { id: "u1", email: "o@desta.works", name: "O", role: "Owner" } };
    h.approve.mockRejectedValue(new AppError("CONFLICT", "Already resolved"));
    const res = await POST(postReq({ clientId: "cl1" }), ctx);
    expect(res.status).toBe(409);
  });

  it("422 when clientId is missing", async () => {
    h.session = { user: { id: "u1", email: "o@desta.works", name: "O", role: "Owner" } };
    const res = await POST(postReq({}), ctx);
    expect(res.status).toBe(422);
    expect(h.approve).not.toHaveBeenCalled();
  });
});
