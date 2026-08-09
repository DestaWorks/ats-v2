import { describe, it, expect, beforeEach, vi } from "vitest";
import { AppError } from "@/server/http/app-error";

/**
 * GET/PATCH/DELETE /api/prospects/:id — all gated `requireCapability("viewClientDiscovery")`:
 * unauth -> 401; a non-leadership role (Screener) -> 403; a leadership role -> 200; a service
 * NOT_FOUND -> 404. `prospectService` is mocked; auth runs for real.
 */

const h = vi.hoisted(() => ({
  session: null as { user: { id: string; email: string; name: string; role?: string } } | null,
  detail: vi.fn(),
  update: vi.fn(),
  softDelete: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/server/auth/auth", () => ({ auth: { api: { getSession: async () => h.session } } }));
vi.mock("@/server/db/prisma", () => ({ prisma: {} }));
vi.mock("@/server/services/prospect.service", () => ({
  prospectService: { detail: h.detail, update: h.update, softDelete: h.softDelete },
}));

import { GET, PATCH, DELETE } from "./route";

const ctx = { params: Promise.resolve({ id: "p1" }) };
function getReq() {
  return new Request("http://localhost/api/prospects/p1");
}
function patchReq(body: unknown) {
  return new Request("http://localhost/api/prospects/p1", {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}
function deleteReq() {
  return new Request("http://localhost/api/prospects/p1", { method: "DELETE" });
}

beforeEach(() => {
  h.session = null;
  h.detail.mockReset();
  h.update.mockReset();
  h.softDelete.mockReset();
});

describe("GET /api/prospects/:id", () => {
  it("401 when signed out and does not read", async () => {
    const res = await GET(getReq(), ctx);
    expect(res.status).toBe(401);
    expect(h.detail).not.toHaveBeenCalled();
  });

  it("403 for a non-leadership role (Screener) and does not read", async () => {
    h.session = { user: { id: "u2", email: "s@desta.works", name: "S", role: "Screener" } };
    const res = await GET(getReq(), ctx);
    expect(res.status).toBe(403);
    expect(h.detail).not.toHaveBeenCalled();
  });

  it("200 with the prospect detail for a leadership role (Owner)", async () => {
    h.session = { user: { id: "u1", email: "o@desta.works", name: "O", role: "Owner" } };
    h.detail.mockResolvedValue({ id: "p1", practiceName: "Sterling Institute" });
    const res = await GET(getReq(), ctx);
    expect(res.status).toBe(200);
    expect((await res.json()).prospect.id).toBe("p1");
  });
});

describe("PATCH /api/prospects/:id", () => {
  it("401 when signed out and does not update", async () => {
    const res = await PATCH(patchReq({ status: "Contacted" }), ctx);
    expect(res.status).toBe(401);
    expect(h.update).not.toHaveBeenCalled();
  });

  it("maps a service CONFLICT (converted prospect) to 409", async () => {
    h.session = { user: { id: "u1", email: "o@desta.works", name: "O", role: "Owner" } };
    h.update.mockRejectedValue(new AppError("CONFLICT", "Prospect already converted to a client"));
    const res = await PATCH(patchReq({ status: "Contacted" }), ctx);
    expect(res.status).toBe(409);
  });
});

describe("DELETE /api/prospects/:id", () => {
  it("200 { ok, id } on success", async () => {
    h.session = { user: { id: "u1", email: "o@desta.works", name: "O", role: "Owner" } };
    h.softDelete.mockResolvedValue({ id: "p1" });
    const res = await DELETE(deleteReq(), ctx);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, id: "p1" });
  });

  it("maps a service NOT_FOUND to 404", async () => {
    h.session = { user: { id: "u1", email: "o@desta.works", name: "O", role: "Owner" } };
    h.softDelete.mockRejectedValue(new AppError("NOT_FOUND", "Prospect not found"));
    const res = await DELETE(deleteReq(), ctx);
    expect(res.status).toBe(404);
  });
});
