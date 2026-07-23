import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * POST /api/crm/clients/:id/deals/:dealId/blockers — gated `requireCapability("viewCrm")`:
 * unauth → 401; non-viewCrm role → 403; leadership → 201.
 */

const h = vi.hoisted(() => ({
  session: null as { user: { id: string; email: string; name: string; role?: string } } | null,
  addBlocker: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/server/auth/auth", () => ({ auth: { api: { getSession: async () => h.session } } }));
vi.mock("@/server/db/prisma", () => ({ prisma: {} }));
vi.mock("@/server/services/client.service", () => ({
  clientService: { addBlocker: h.addBlocker },
}));

import { POST } from "./route";

const ctx = { params: Promise.resolve({ id: "c1", dealId: "cd1" }) };
function req(body: unknown) {
  return new Request("http://localhost/api/crm/clients/c1/deals/cd1/blockers", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  h.session = null;
  h.addBlocker.mockReset();
});

describe("POST /api/crm/clients/:id/deals/:dealId/blockers", () => {
  it("401 when signed out and does not add", async () => {
    const res = await POST(req({ text: "Waiting on legal" }), ctx);
    expect(res.status).toBe(401);
    expect(h.addBlocker).not.toHaveBeenCalled();
  });

  it("403 for a non-viewCrm role (Associate)", async () => {
    h.session = { user: { id: "u2", email: "a@desta.works", name: "A", role: "Associate" } };
    const res = await POST(req({ text: "Waiting on legal" }), ctx);
    expect(res.status).toBe(403);
    expect(h.addBlocker).not.toHaveBeenCalled();
  });

  it("201 for a leadership role (Owner) — forwards the validated input", async () => {
    h.session = { user: { id: "u1", email: "o@desta.works", name: "O", role: "Owner" } };
    h.addBlocker.mockResolvedValue({ id: "db1", text: "Waiting on legal" });
    const res = await POST(req({ text: "Waiting on legal" }), ctx);
    expect(res.status).toBe(201);
    expect(h.addBlocker).toHaveBeenCalledWith(
      "c1",
      "cd1",
      expect.objectContaining({ text: "Waiting on legal" }),
      expect.objectContaining({ id: "u1" }),
    );
  });

  it("422 on an empty text", async () => {
    h.session = { user: { id: "u1", email: "o@desta.works", name: "O", role: "Owner" } };
    const res = await POST(req({ text: "" }), ctx);
    expect(res.status).toBe(422);
    expect(h.addBlocker).not.toHaveBeenCalled();
  });
});
