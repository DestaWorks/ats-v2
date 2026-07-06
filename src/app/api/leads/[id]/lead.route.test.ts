import { describe, it, expect, beforeEach, vi } from "vitest";
import { AppError } from "@/server/http/app-error";

/**
 * DELETE /api/leads/:id — the guarded soft-delete: unauth → 401; happy → 200 `{ ok, id }`; a service
 * NOT_FOUND → 404. `leadService.softDelete` is mocked; auth runs for real.
 */

const h = vi.hoisted(() => ({
  session: null as { user: { id: string; email: string; name: string; role?: string } } | null,
  softDelete: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/server/auth/auth", () => ({ auth: { api: { getSession: async () => h.session } } }));
vi.mock("@/server/db/prisma", () => ({ prisma: {} }));
vi.mock("@/server/services/lead.service", () => ({ leadService: { softDelete: h.softDelete } }));

import { DELETE } from "./route";

function req() {
  return new Request("http://localhost/api/leads/l1", { method: "DELETE" });
}
const ctx = { params: Promise.resolve({ id: "l1" }) };

beforeEach(() => {
  h.session = { user: { id: "u1", email: "u@desta.works", name: "U", role: "Associate" } };
  h.softDelete.mockReset();
});

describe("DELETE /api/leads/:id", () => {
  it("returns 401 when signed out and does not delete", async () => {
    h.session = null;
    const res = await DELETE(req(), ctx);
    expect(res.status).toBe(401);
    expect(h.softDelete).not.toHaveBeenCalled();
  });

  it("200 { ok, id } on success", async () => {
    h.softDelete.mockResolvedValue({ id: "l1" });
    const res = await DELETE(req(), ctx);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, id: "l1" });
    expect(h.softDelete).toHaveBeenCalledWith("l1", expect.objectContaining({ id: "u1" }));
  });

  it("maps a service NOT_FOUND to 404", async () => {
    h.softDelete.mockRejectedValue(new AppError("NOT_FOUND", "Lead not found"));
    const res = await DELETE(req(), ctx);
    expect(res.status).toBe(404);
  });
});
