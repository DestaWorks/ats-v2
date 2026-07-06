import { describe, it, expect, beforeEach, vi } from "vitest";
import { AppError } from "@/server/http/app-error";

/**
 * POST /api/leads/:id/outreach — unauth → 401; happy → 200 `{ lead }`; an invalid `channel` → 422; a
 * service CONFLICT (Promoted) → 409; NOT_FOUND → 404. `leadService.logOutreach` is mocked.
 */

const h = vi.hoisted(() => ({
  session: null as { user: { id: string; email: string; name: string; role?: string } } | null,
  logOutreach: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/server/auth/auth", () => ({ auth: { api: { getSession: async () => h.session } } }));
vi.mock("@/server/db/prisma", () => ({ prisma: {} }));
vi.mock("@/server/services/lead.service", () => ({ leadService: { logOutreach: h.logOutreach } }));

import { POST } from "./route";

function req(body: unknown) {
  return new Request("http://localhost/api/leads/l1/outreach", {
    method: "POST",
    body: JSON.stringify(body),
  });
}
const ctx = { params: Promise.resolve({ id: "l1" }) };

beforeEach(() => {
  h.session = { user: { id: "u1", email: "u@desta.works", name: "U", role: "Associate" } };
  h.logOutreach.mockReset();
});

describe("POST /api/leads/:id/outreach", () => {
  it("returns 401 when signed out and does not log", async () => {
    h.session = null;
    const res = await POST(req({ channel: "email" }), ctx);
    expect(res.status).toBe(401);
    expect(h.logOutreach).not.toHaveBeenCalled();
  });

  it("200 happy path — forwards the validated input", async () => {
    h.logOutreach.mockResolvedValue({ id: "l1", status: "Outreach 1" });
    const res = await POST(req({ channel: "email", note: "hi" }), ctx);
    expect(res.status).toBe(200);
    expect(h.logOutreach).toHaveBeenCalledWith(
      "l1",
      expect.objectContaining({ channel: "email", note: "hi" }),
      expect.objectContaining({ id: "u1" }),
    );
    expect((await res.json()).lead.status).toBe("Outreach 1");
  });

  it("422 on an invalid channel", async () => {
    const res = await POST(req({ channel: "carrier-pigeon" }), ctx);
    expect(res.status).toBe(422);
    expect(h.logOutreach).not.toHaveBeenCalled();
  });

  it("maps a service CONFLICT (Promoted) to 409", async () => {
    h.logOutreach.mockRejectedValue(new AppError("CONFLICT", "Lead already promoted"));
    const res = await POST(req({ channel: "email" }), ctx);
    expect(res.status).toBe(409);
  });

  it("maps a service NOT_FOUND to 404", async () => {
    h.logOutreach.mockRejectedValue(new AppError("NOT_FOUND", "Lead not found"));
    const res = await POST(req({ channel: "email" }), ctx);
    expect(res.status).toBe(404);
  });
});
