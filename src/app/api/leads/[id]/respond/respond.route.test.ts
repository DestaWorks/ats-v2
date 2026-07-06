import { describe, it, expect, beforeEach, vi } from "vitest";
import { AppError } from "@/server/http/app-error";

/**
 * POST /api/leads/:id/respond — unauth → 401; happy → 200 `{ lead }`; a bad `kind` → 422; a service
 * CONFLICT (Promoted) → 409; NOT_FOUND → 404. `leadService.respond` is mocked.
 */

const h = vi.hoisted(() => ({
  session: null as { user: { id: string; email: string; name: string; role?: string } } | null,
  respond: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/server/auth/auth", () => ({ auth: { api: { getSession: async () => h.session } } }));
vi.mock("@/server/db/prisma", () => ({ prisma: {} }));
vi.mock("@/server/services/lead.service", () => ({ leadService: { respond: h.respond } }));

import { POST } from "./route";

function req(body: unknown) {
  return new Request("http://localhost/api/leads/l1/respond", {
    method: "POST",
    body: JSON.stringify(body),
  });
}
const ctx = { params: Promise.resolve({ id: "l1" }) };

beforeEach(() => {
  h.session = { user: { id: "u1", email: "u@desta.works", name: "U", role: "Associate" } };
  h.respond.mockReset();
});

describe("POST /api/leads/:id/respond", () => {
  it("returns 401 when signed out and does not respond", async () => {
    h.session = null;
    const res = await POST(req({ kind: "hot" }), ctx);
    expect(res.status).toBe(401);
    expect(h.respond).not.toHaveBeenCalled();
  });

  it("200 happy path — forwards the kind", async () => {
    h.respond.mockResolvedValue({ id: "l1", status: "Responded — Hot" });
    const res = await POST(req({ kind: "hot" }), ctx);
    expect(res.status).toBe(200);
    expect(h.respond).toHaveBeenCalledWith("l1", "hot", expect.objectContaining({ id: "u1" }));
    expect((await res.json()).lead.status).toBe("Responded — Hot");
  });

  it("422 on a bad kind", async () => {
    const res = await POST(req({ kind: "lukewarm" }), ctx);
    expect(res.status).toBe(422);
    expect(h.respond).not.toHaveBeenCalled();
  });

  it("maps a service CONFLICT (Promoted) to 409", async () => {
    h.respond.mockRejectedValue(new AppError("CONFLICT", "Lead already promoted"));
    const res = await POST(req({ kind: "cold" }), ctx);
    expect(res.status).toBe(409);
  });

  it("maps a service NOT_FOUND to 404", async () => {
    h.respond.mockRejectedValue(new AppError("NOT_FOUND", "Lead not found"));
    const res = await POST(req({ kind: "hot" }), ctx);
    expect(res.status).toBe(404);
  });
});
