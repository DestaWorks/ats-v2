import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * DELETE /api/crm/clients/:id/meetings/:meetingId — gated `requireCapability("viewCrm")`:
 * unauth → 401; non-viewCrm role → 403; leadership → 200.
 */

const h = vi.hoisted(() => ({
  session: null as { user: { id: string; email: string; name: string; role?: string } } | null,
  removeMeeting: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/server/auth/auth", () => ({ auth: { api: { getSession: async () => h.session } } }));
vi.mock("@/server/db/prisma", () => ({ prisma: {} }));
vi.mock("@/server/services/client.service", () => ({
  clientService: { removeMeeting: h.removeMeeting },
}));

import { DELETE } from "./route";

const ctx = { params: Promise.resolve({ id: "c1", meetingId: "cm1" }) };
const deleteReq = () =>
  new Request("http://localhost/api/crm/clients/c1/meetings/cm1", { method: "DELETE" });

beforeEach(() => {
  h.session = null;
  h.removeMeeting.mockReset();
});

describe("DELETE /api/crm/clients/:id/meetings/:meetingId", () => {
  it("401 when signed out and does not delete", async () => {
    const res = await DELETE(deleteReq(), ctx);
    expect(res.status).toBe(401);
    expect(h.removeMeeting).not.toHaveBeenCalled();
  });

  it("403 for a non-viewCrm role (Associate)", async () => {
    h.session = { user: { id: "u2", email: "a@desta.works", name: "A", role: "Associate" } };
    const res = await DELETE(deleteReq(), ctx);
    expect(res.status).toBe(403);
    expect(h.removeMeeting).not.toHaveBeenCalled();
  });

  it("200 for a leadership role (Owner)", async () => {
    h.session = { user: { id: "u1", email: "o@desta.works", name: "O", role: "Owner" } };
    h.removeMeeting.mockResolvedValue(undefined);
    const res = await DELETE(deleteReq(), ctx);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, id: "cm1" });
    expect(h.removeMeeting).toHaveBeenCalledWith(
      "c1",
      "cm1",
      expect.objectContaining({ id: "u1" }),
    );
  });
});
