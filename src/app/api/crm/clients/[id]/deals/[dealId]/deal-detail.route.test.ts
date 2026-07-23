import { describe, it, expect, beforeEach, vi } from "vitest";
import { AppError } from "@/server/http/app-error";

/**
 * PATCH/DELETE /api/crm/clients/:id/deals/:dealId — gated `requireCapability("viewCrm")`:
 * unauth → 401; non-viewCrm role → 403; leadership → 200; a deal belonging to another client
 * (or missing) → 404.
 */

const h = vi.hoisted(() => ({
  session: null as { user: { id: string; email: string; name: string; role?: string } } | null,
  updateDeal: vi.fn(),
  removeDeal: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/server/auth/auth", () => ({ auth: { api: { getSession: async () => h.session } } }));
vi.mock("@/server/db/prisma", () => ({ prisma: {} }));
vi.mock("@/server/services/client.service", () => ({
  clientService: { updateDeal: h.updateDeal, removeDeal: h.removeDeal },
}));

import { PATCH, DELETE } from "./route";

const ctx = { params: Promise.resolve({ id: "c1", dealId: "cd1" }) };
function patchReq(body: unknown) {
  return new Request("http://localhost/api/crm/clients/c1/deals/cd1", {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}
const deleteReq = () =>
  new Request("http://localhost/api/crm/clients/c1/deals/cd1", { method: "DELETE" });

beforeEach(() => {
  h.session = null;
  h.updateDeal.mockReset();
  h.removeDeal.mockReset();
});

describe("PATCH /api/crm/clients/:id/deals/:dealId", () => {
  it("401 when signed out and does not update", async () => {
    const res = await PATCH(patchReq({ stage: "Signed" }), ctx);
    expect(res.status).toBe(401);
    expect(h.updateDeal).not.toHaveBeenCalled();
  });

  it("403 for a non-viewCrm role (Screener)", async () => {
    h.session = { user: { id: "u2", email: "s@desta.works", name: "S", role: "Screener" } };
    const res = await PATCH(patchReq({ stage: "Signed" }), ctx);
    expect(res.status).toBe(403);
    expect(h.updateDeal).not.toHaveBeenCalled();
  });

  it("200 for a leadership role (Owner) — forwards id + dealId + validated input", async () => {
    h.session = { user: { id: "u1", email: "o@desta.works", name: "O", role: "Owner" } };
    h.updateDeal.mockResolvedValue({ id: "cd1", stage: "Signed" });
    const res = await PATCH(patchReq({ stage: "Signed" }), ctx);
    expect(res.status).toBe(200);
    expect(h.updateDeal).toHaveBeenCalledWith(
      "c1",
      "cd1",
      expect.objectContaining({ stage: "Signed" }),
      expect.objectContaining({ id: "u1" }),
    );
  });

  it("maps a service NOT_FOUND to 404", async () => {
    h.session = { user: { id: "u1", email: "o@desta.works", name: "O", role: "Owner" } };
    h.updateDeal.mockRejectedValue(new AppError("NOT_FOUND", "Deal not found"));
    const res = await PATCH(patchReq({ stage: "Signed" }), ctx);
    expect(res.status).toBe(404);
  });
});

describe("DELETE /api/crm/clients/:id/deals/:dealId", () => {
  it("401 when signed out and does not delete", async () => {
    const res = await DELETE(deleteReq(), ctx);
    expect(res.status).toBe(401);
    expect(h.removeDeal).not.toHaveBeenCalled();
  });

  it("403 for a non-viewCrm role (Associate)", async () => {
    h.session = { user: { id: "u2", email: "a@desta.works", name: "A", role: "Associate" } };
    const res = await DELETE(deleteReq(), ctx);
    expect(res.status).toBe(403);
    expect(h.removeDeal).not.toHaveBeenCalled();
  });

  it("200 for a leadership role (Owner)", async () => {
    h.session = { user: { id: "u1", email: "o@desta.works", name: "O", role: "Owner" } };
    h.removeDeal.mockResolvedValue(undefined);
    const res = await DELETE(deleteReq(), ctx);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, id: "cd1" });
    expect(h.removeDeal).toHaveBeenCalledWith("c1", "cd1", expect.objectContaining({ id: "u1" }));
  });
});
