import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * POST /api/crm/clients/:id/deals — gated `requireCapability("viewCrm")`: unauth → 401;
 * non-viewCrm role → 403; leadership → 201.
 */

const h = vi.hoisted(() => ({
  session: null as { user: { id: string; email: string; name: string; role?: string } } | null,
  addDeal: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/server/auth/auth", () => ({ auth: { api: { getSession: async () => h.session } } }));
vi.mock("@/server/db/prisma", () => ({ prisma: {} }));
vi.mock("@/server/services/client.service", () => ({ clientService: { addDeal: h.addDeal } }));

import { POST } from "./route";

const ctx = { params: Promise.resolve({ id: "c1" }) };
function req(body: unknown) {
  return new Request("http://localhost/api/crm/clients/c1/deals", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  h.session = null;
  h.addDeal.mockReset();
});

describe("POST /api/crm/clients/:id/deals", () => {
  it("401 when signed out and does not add", async () => {
    const res = await POST(req({ name: "Q3 renewal" }), ctx);
    expect(res.status).toBe(401);
    expect(h.addDeal).not.toHaveBeenCalled();
  });

  it("403 for a non-viewCrm role (Associate)", async () => {
    h.session = { user: { id: "u2", email: "a@desta.works", name: "A", role: "Associate" } };
    const res = await POST(req({ name: "Q3 renewal" }), ctx);
    expect(res.status).toBe(403);
    expect(h.addDeal).not.toHaveBeenCalled();
  });

  it("201 for a leadership role (Owner) — forwards the validated input", async () => {
    h.session = { user: { id: "u1", email: "o@desta.works", name: "O", role: "Owner" } };
    h.addDeal.mockResolvedValue({ id: "cd1", name: "Q3 renewal" });
    const res = await POST(req({ name: "Q3 renewal" }), ctx);
    expect(res.status).toBe(201);
    expect(h.addDeal).toHaveBeenCalledWith(
      "c1",
      expect.objectContaining({ name: "Q3 renewal" }),
      expect.objectContaining({ id: "u1" }),
    );
  });

  it("422 on an empty name", async () => {
    h.session = { user: { id: "u1", email: "o@desta.works", name: "O", role: "Owner" } };
    const res = await POST(req({ name: "" }), ctx);
    expect(res.status).toBe(422);
    expect(h.addDeal).not.toHaveBeenCalled();
  });
});
