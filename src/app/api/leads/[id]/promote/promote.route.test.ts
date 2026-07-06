import { describe, it, expect, beforeEach, vi } from "vitest";
import { AppError } from "@/server/http/app-error";

/**
 * POST /api/leads/:id/promote — unauth → 401; happy → 200 `{ candidateId }`; an already-promoted lead
 * (service CONFLICT) → 409; NOT_FOUND → 404. `leadService.promote` is mocked.
 */

const h = vi.hoisted(() => ({
  session: null as { user: { id: string; email: string; name: string; role?: string } } | null,
  promote: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/server/auth/auth", () => ({ auth: { api: { getSession: async () => h.session } } }));
vi.mock("@/server/db/prisma", () => ({ prisma: {} }));
vi.mock("@/server/services/lead.service", () => ({ leadService: { promote: h.promote } }));

import { POST } from "./route";

function req() {
  return new Request("http://localhost/api/leads/l1/promote", { method: "POST" });
}
const ctx = { params: Promise.resolve({ id: "l1" }) };

beforeEach(() => {
  h.session = { user: { id: "u1", email: "u@desta.works", name: "U", role: "Associate" } };
  h.promote.mockReset();
});

describe("POST /api/leads/:id/promote", () => {
  it("returns 401 when signed out and does not promote", async () => {
    h.session = null;
    const res = await POST(req(), ctx);
    expect(res.status).toBe(401);
    expect(h.promote).not.toHaveBeenCalled();
  });

  it("200 { candidateId } on success", async () => {
    h.promote.mockResolvedValue({ candidateId: "c-new" });
    const res = await POST(req(), ctx);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ candidateId: "c-new" });
    expect(h.promote).toHaveBeenCalledWith("l1", expect.objectContaining({ id: "u1" }));
  });

  it("maps an already-promoted CONFLICT to 409", async () => {
    h.promote.mockRejectedValue(new AppError("CONFLICT", "Lead already promoted"));
    const res = await POST(req(), ctx);
    expect(res.status).toBe(409);
  });

  it("maps a service NOT_FOUND to 404", async () => {
    h.promote.mockRejectedValue(new AppError("NOT_FOUND", "Lead not found"));
    const res = await POST(req(), ctx);
    expect(res.status).toBe(404);
  });
});
