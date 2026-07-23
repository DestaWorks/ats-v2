import { describe, it, expect, beforeEach, vi } from "vitest";
import { AppError } from "@/server/http/app-error";

/**
 * POST /api/admin/access-requests/:id/approve — gated `manageAccessRequests`: unauth → 401;
 * non-manageAccessRequests → 403; Owner → 200; a resolved/missing request → the service's
 * NOT_FOUND/CONFLICT mapped through `apiHandler`.
 */

const h = vi.hoisted(() => ({
  session: null as { user: { id: string; email: string; name: string; role?: string } } | null,
  approve: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/server/auth/auth", () => ({ auth: { api: { getSession: async () => h.session } } }));
vi.mock("@/server/db/prisma", () => ({ prisma: {} }));
vi.mock("@/server/services/access-request.service", () => ({
  accessRequestService: { approve: h.approve },
}));

import { POST } from "./route";

const ctx = { params: Promise.resolve({ id: "r1" }) };
function postReq(body: unknown) {
  return new Request("http://localhost/api/admin/access-requests/r1/approve", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  h.session = null;
  h.approve.mockReset();
});

describe("POST /api/admin/access-requests/:id/approve", () => {
  it("401 when signed out and does not approve", async () => {
    const res = await POST(postReq({ role: "Associate" }), ctx);
    expect(res.status).toBe(401);
    expect(h.approve).not.toHaveBeenCalled();
  });

  it("403 for a non-manageAccessRequests role (Director)", async () => {
    h.session = { user: { id: "u1", email: "d@desta.works", name: "D", role: "Director" } };
    const res = await POST(postReq({ role: "Associate" }), ctx);
    expect(res.status).toBe(403);
    expect(h.approve).not.toHaveBeenCalled();
  });

  it("200 for Owner — forwards id + role", async () => {
    h.session = { user: { id: "u1", email: "o@desta.works", name: "O", role: "Owner" } };
    h.approve.mockResolvedValue({ user: { id: "n1" }, generatedPassword: "pw123" });
    const res = await POST(postReq({ role: "Associate" }), ctx);
    expect(res.status).toBe(200);
    expect(h.approve).toHaveBeenCalledWith("r1", "Associate");
  });

  it("maps a service CONFLICT to 409", async () => {
    h.session = { user: { id: "u1", email: "o@desta.works", name: "O", role: "Owner" } };
    h.approve.mockRejectedValue(new AppError("CONFLICT", "Already resolved"));
    const res = await POST(postReq({ role: "Associate" }), ctx);
    expect(res.status).toBe(409);
  });
});
