import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * POST /api/crm/clients/:id/meetings — gated `requireCapability("viewCrm")`: unauth → 401;
 * non-viewCrm role → 403; leadership → 201.
 */

const h = vi.hoisted(() => ({
  session: null as { user: { id: string; email: string; name: string; role?: string } } | null,
  addMeeting: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/server/auth/auth", () => ({ auth: { api: { getSession: async () => h.session } } }));
vi.mock("@/server/db/prisma", () => ({ prisma: {} }));
vi.mock("@/server/services/client.service", () => ({
  clientService: { addMeeting: h.addMeeting },
}));

import { POST } from "./route";

const ctx = { params: Promise.resolve({ id: "c1" }) };
function req(body: unknown) {
  return new Request("http://localhost/api/crm/clients/c1/meetings", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  h.session = null;
  h.addMeeting.mockReset();
});

describe("POST /api/crm/clients/:id/meetings", () => {
  it("401 when signed out and does not add", async () => {
    const res = await POST(req({ type: "qbr" }), ctx);
    expect(res.status).toBe(401);
    expect(h.addMeeting).not.toHaveBeenCalled();
  });

  it("403 for a non-viewCrm role (Associate)", async () => {
    h.session = { user: { id: "u2", email: "a@desta.works", name: "A", role: "Associate" } };
    const res = await POST(req({ type: "qbr" }), ctx);
    expect(res.status).toBe(403);
    expect(h.addMeeting).not.toHaveBeenCalled();
  });

  it("201 for a leadership role (Owner) — forwards the validated input", async () => {
    h.session = { user: { id: "u1", email: "o@desta.works", name: "O", role: "Owner" } };
    h.addMeeting.mockResolvedValue({ id: "cm1", type: "qbr" });
    const res = await POST(req({ type: "qbr", attendees: "Dr. Brown" }), ctx);
    expect(res.status).toBe(201);
    expect(h.addMeeting).toHaveBeenCalledWith(
      "c1",
      expect.objectContaining({ type: "qbr", attendees: "Dr. Brown" }),
      expect.objectContaining({ id: "u1" }),
    );
  });

  it("422 on an invalid type", async () => {
    h.session = { user: { id: "u1", email: "o@desta.works", name: "O", role: "Owner" } };
    const res = await POST(req({ type: "carrier-pigeon" }), ctx);
    expect(res.status).toBe(422);
    expect(h.addMeeting).not.toHaveBeenCalled();
  });
});
