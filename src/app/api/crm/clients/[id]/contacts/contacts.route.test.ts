import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * POST /api/crm/clients/:id/contacts — gated `requireCapability("viewCrm")`: unauth → 401;
 * non-viewCrm role → 403; leadership → 201.
 */

const h = vi.hoisted(() => ({
  session: null as { user: { id: string; email: string; name: string; role?: string } } | null,
  addContact: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/server/auth/auth", () => ({ auth: { api: { getSession: async () => h.session } } }));
vi.mock("@/server/db/prisma", () => ({ prisma: {} }));
vi.mock("@/server/services/client.service", () => ({
  clientService: { addContact: h.addContact },
}));

import { POST } from "./route";

const ctx = { params: Promise.resolve({ id: "c1" }) };
function req(body: unknown) {
  return new Request("http://localhost/api/crm/clients/c1/contacts", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  h.session = null;
  h.addContact.mockReset();
});

describe("POST /api/crm/clients/:id/contacts", () => {
  it("401 when signed out and does not add", async () => {
    const res = await POST(req({ fullName: "Jane Doe" }), ctx);
    expect(res.status).toBe(401);
    expect(h.addContact).not.toHaveBeenCalled();
  });

  it("403 for a non-viewCrm role (Associate)", async () => {
    h.session = { user: { id: "u2", email: "a@desta.works", name: "A", role: "Associate" } };
    const res = await POST(req({ fullName: "Jane Doe" }), ctx);
    expect(res.status).toBe(403);
    expect(h.addContact).not.toHaveBeenCalled();
  });

  it("201 for a leadership role (Owner) — forwards the validated input", async () => {
    h.session = { user: { id: "u1", email: "o@desta.works", name: "O", role: "Owner" } };
    h.addContact.mockResolvedValue({ id: "cc1", fullName: "Jane Doe" });
    const res = await POST(req({ fullName: "Jane Doe", role: "decision_maker" }), ctx);
    expect(res.status).toBe(201);
    expect(h.addContact).toHaveBeenCalledWith(
      "c1",
      expect.objectContaining({ fullName: "Jane Doe", role: "decision_maker" }),
      expect.objectContaining({ id: "u1" }),
    );
  });

  it("422 on an empty fullName", async () => {
    h.session = { user: { id: "u1", email: "o@desta.works", name: "O", role: "Owner" } };
    const res = await POST(req({ fullName: "" }), ctx);
    expect(res.status).toBe(422);
    expect(h.addContact).not.toHaveBeenCalled();
  });
});
