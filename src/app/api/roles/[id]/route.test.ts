import { describe, it, expect, beforeEach, vi } from "vitest";
import { AppError } from "@/server/http/app-error";

/**
 * GET/PATCH/DELETE /api/roles/:id. DELETE is the capability-gated hard delete
 * (SECURITY-AUDIT-APP.md H7): unauth → 401; a viewer WITHOUT `deleteOpenRole` (Associate/Manager)
 * → 403 before any service work; an Owner (holds the capability) → 200. GET/PATCH stay open to
 * any signed-in user (existing behavior, unchanged).
 */

const h = vi.hoisted(() => ({
  session: null as { user: { id: string; email: string; name: string; role?: string } } | null,
  detail: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/server/auth/auth", () => ({ auth: { api: { getSession: async () => h.session } } }));
vi.mock("@/server/db/prisma", () => ({ prisma: {} }));
vi.mock("@/server/services/open-role.service", () => ({
  openRoleService: { detail: h.detail, update: h.update, remove: h.remove },
}));

import { GET, PATCH, DELETE } from "./route";

function req(method: string, body?: unknown) {
  return new Request("http://localhost/api/roles/r1", {
    method,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}
const ctx = { params: Promise.resolve({ id: "r1" }) };

beforeEach(() => {
  h.session = { user: { id: "o1", email: "o@desta.works", name: "O", role: "Owner" } };
  h.detail.mockReset();
  h.update.mockReset();
  h.remove.mockReset();
});

describe("GET /api/roles/:id", () => {
  it("returns 401 when signed out", async () => {
    h.session = null;
    const res = await GET(req("GET"), ctx);
    expect(res.status).toBe(401);
  });

  it("200 for any signed-in user (Associate)", async () => {
    h.session = { user: { id: "u1", email: "u@desta.works", name: "U", role: "Associate" } };
    h.detail.mockResolvedValue({ id: "r1" });
    const res = await GET(req("GET"), ctx);
    expect(res.status).toBe(200);
  });
});

describe("PATCH /api/roles/:id", () => {
  it("returns 401 when signed out and does not call the service", async () => {
    h.session = null;
    const res = await PATCH(req("PATCH", { title: "PMHNP" }), ctx);
    expect(res.status).toBe(401);
    expect(h.update).not.toHaveBeenCalled();
  });

  it("200 for any signed-in user (Associate) — no capability gate, unlike DELETE", async () => {
    h.session = { user: { id: "u1", email: "u@desta.works", name: "U", role: "Associate" } };
    h.update.mockResolvedValue({ id: "r1", title: "PMHNP" });
    const res = await PATCH(req("PATCH", { title: "PMHNP" }), ctx);
    expect(res.status).toBe(200);
  });
});

describe("DELETE /api/roles/:id", () => {
  it("returns 401 when signed out and does not call the service", async () => {
    h.session = null;
    const res = await DELETE(req("DELETE"), ctx);
    expect(res.status).toBe(401);
    expect(h.remove).not.toHaveBeenCalled();
  });

  it("returns 403 for a viewer without deleteOpenRole (Associate) — service untouched", async () => {
    h.session = { user: { id: "u1", email: "u@desta.works", name: "U", role: "Associate" } };
    const res = await DELETE(req("DELETE"), ctx);
    expect(res.status).toBe(403);
    expect(h.remove).not.toHaveBeenCalled();
  });

  it("returns 403 for Manager (leadership but not admin) — deleteOpenRole is Owner/Admin only", async () => {
    h.session = { user: { id: "m1", email: "m@desta.works", name: "M", role: "Manager" } };
    const res = await DELETE(req("DELETE"), ctx);
    expect(res.status).toBe(403);
    expect(h.remove).not.toHaveBeenCalled();
  });

  it("200 for an Owner — forwards id + user", async () => {
    h.remove.mockResolvedValue({ ok: true, id: "r1" });
    const res = await DELETE(req("DELETE"), ctx);
    expect(res.status).toBe(200);
    expect(h.remove).toHaveBeenCalledWith(
      "r1",
      expect.objectContaining({ id: "o1", role: "Owner" }),
    );
  });

  it("maps a service NOT_FOUND to 404", async () => {
    h.remove.mockRejectedValue(new AppError("NOT_FOUND", "Role not found"));
    const res = await DELETE(req("DELETE"), ctx);
    expect(res.status).toBe(404);
  });
});
