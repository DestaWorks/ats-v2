import { describe, it, expect, beforeEach, vi } from "vitest";

/** POST /api/crm/clients/:id/portal/tokens/:tokenId/revoke — gated `configureClientPortal`. */

const h = vi.hoisted(() => ({
  session: null as { user: { id: string; email: string; name: string; role?: string } } | null,
  revokeLink: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@destaworks/config/request-context", () => ({
  requestContext: () => ({ headers: async () => new Headers() }),
}));
vi.mock("@destaworks/auth/auth", () => ({ auth: { api: { getSession: async () => h.session } } }));
vi.mock("@destaworks/db/prisma", () => ({ prisma: {} }));
vi.mock("@destaworks/application/client-portal.service", () => ({
  clientPortalService: { revokeLink: h.revokeLink },
}));

import { POST } from "./route";

const ctx = { params: Promise.resolve({ id: "cl1", tokenId: "t1" }) };
const postReq = () =>
  new Request("http://localhost/api/crm/clients/cl1/portal/tokens/t1/revoke", {
    method: "POST",
  });

beforeEach(() => {
  h.session = null;
  h.revokeLink.mockReset();
});

describe("POST /api/crm/clients/:id/portal/tokens/:tokenId/revoke", () => {
  it("401 when signed out and does not revoke", async () => {
    const res = await POST(postReq(), ctx);
    expect(res.status).toBe(401);
    expect(h.revokeLink).not.toHaveBeenCalled();
  });

  it("403 for a non-configureClientPortal role (Screener)", async () => {
    h.session = { user: { id: "u1", email: "s@desta.works", name: "S", role: "Screener" } };
    const res = await POST(postReq(), ctx);
    expect(res.status).toBe(403);
    expect(h.revokeLink).not.toHaveBeenCalled();
  });

  it("200 for Owner", async () => {
    h.session = { user: { id: "u1", email: "o@desta.works", name: "O", role: "Owner" } };
    h.revokeLink.mockResolvedValue(undefined);
    const res = await POST(postReq(), ctx);
    expect(res.status).toBe(200);
    expect(h.revokeLink).toHaveBeenCalledWith("cl1", "t1", expect.objectContaining({ id: "u1" }));
  });
});
