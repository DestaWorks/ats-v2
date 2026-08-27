import { describe, it, expect, beforeEach, vi } from "vitest";

/** POST /api/crm/clients/:id/portal/contacts/:contactId/tokens — gated `configureClientPortal`. */

const h = vi.hoisted(() => ({
  session: null as { user: { id: string; email: string; name: string; role?: string } } | null,
  generateLink: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@destaworks/config/request-context", () => ({
  requestContext: () => ({ headers: async () => new Headers() }),
}));
vi.mock("@destaworks/auth/auth", () => ({ auth: { api: { getSession: async () => h.session } } }));
vi.mock("@destaworks/db/prisma", () => ({ prisma: {} }));
vi.mock("@destaworks/application/client-portal.service", () => ({
  clientPortalService: { generateLink: h.generateLink },
}));

import { POST } from "./route";

const ctx = { params: Promise.resolve({ id: "cl1", contactId: "c1" }) };
const postReq = () =>
  new Request("http://localhost/api/crm/clients/cl1/portal/contacts/c1/tokens", {
    method: "POST",
  });

beforeEach(() => {
  h.session = null;
  h.generateLink.mockReset();
});

describe("POST /api/crm/clients/:id/portal/contacts/:contactId/tokens", () => {
  it("401 when signed out and does not generate", async () => {
    const res = await POST(postReq(), ctx);
    expect(res.status).toBe(401);
    expect(h.generateLink).not.toHaveBeenCalled();
  });

  it("403 for a non-configureClientPortal role (Manager)", async () => {
    h.session = { user: { id: "u1", email: "m@desta.works", name: "M", role: "Manager" } };
    const res = await POST(postReq(), ctx);
    expect(res.status).toBe(403);
    expect(h.generateLink).not.toHaveBeenCalled();
  });

  it("201 for Owner — forwards clientId + contactId", async () => {
    h.session = { user: { id: "u1", email: "o@desta.works", name: "O", role: "Owner" } };
    h.generateLink.mockResolvedValue({ contact: { id: "c1" }, token: "rawtoken" });
    const res = await POST(postReq(), ctx);
    expect(res.status).toBe(201);
    expect(h.generateLink).toHaveBeenCalledWith("cl1", "c1", expect.objectContaining({ id: "u1" }));
  });
});
