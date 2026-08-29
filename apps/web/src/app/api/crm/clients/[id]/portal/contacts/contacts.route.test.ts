import { describe, it, expect, beforeEach, vi } from "vitest";

/** GET /api/crm/clients/:id/portal/contacts — gated `configureClientPortal` (Owner/Admin only, stricter than `viewCrm`). */

const h = vi.hoisted(() => ({
  session: null as { user: { id: string; email: string; name: string; role?: string } } | null,
  listContactsForClient: vi.fn(),
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
vi.mock("@destaworks/application/client-portal.service", () => ({
  clientPortalService: { listContactsForClient: h.listContactsForClient },
}));

import { GET } from "./route";

const ctx = { params: Promise.resolve({ id: "cl1" }) };
const getReq = () => new Request("http://localhost/api/crm/clients/cl1/portal/contacts");

beforeEach(() => {
  h.session = null;
  h.listContactsForClient.mockReset();
});

describe("GET /api/crm/clients/:id/portal/contacts", () => {
  it("401 when signed out", async () => {
    const res = await GET(getReq(), ctx);
    expect(res.status).toBe(401);
    expect(h.listContactsForClient).not.toHaveBeenCalled();
  });

  it("403 for a leadership role WITHOUT configureClientPortal (Director)", async () => {
    h.session = { user: { id: "u1", email: "d@desta.works", name: "D", role: "Director" } };
    const res = await GET(getReq(), ctx);
    expect(res.status).toBe(403);
    expect(h.listContactsForClient).not.toHaveBeenCalled();
  });

  it("200 for Owner", async () => {
    h.session = { user: { id: "u1", email: "o@desta.works", name: "O", role: "Owner" } };
    h.listContactsForClient.mockResolvedValue([]);
    const res = await GET(getReq(), ctx);
    expect(res.status).toBe(200);
    expect(h.listContactsForClient).toHaveBeenCalledWith("cl1", expect.anything());
  });
});
