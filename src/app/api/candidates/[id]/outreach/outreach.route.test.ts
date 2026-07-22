import { describe, it, expect, beforeEach, vi } from "vitest";
import { AppError } from "@/server/http/app-error";

/**
 * POST /api/candidates/:id/outreach — unauth → 401; happy → 201 `{ attempt }`, forwarding
 * `templateId` (Wave 4.1) through to the service; an invalid channel → 422; NOT_FOUND → 404.
 * `candidateService.logOutreach` is mocked.
 */

const h = vi.hoisted(() => ({
  session: null as { user: { id: string; email: string; name: string; role?: string } } | null,
  logOutreach: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/server/auth/auth", () => ({ auth: { api: { getSession: async () => h.session } } }));
vi.mock("@/server/db/prisma", () => ({ prisma: {} }));
vi.mock("@/server/services/candidate.service", () => ({
  candidateService: { logOutreach: h.logOutreach },
}));

import { POST } from "./route";

function req(body: unknown) {
  return new Request("http://localhost/api/candidates/c1/outreach", {
    method: "POST",
    body: JSON.stringify(body),
  });
}
const ctx = { params: Promise.resolve({ id: "c1" }) };

beforeEach(() => {
  h.session = { user: { id: "u1", email: "u@desta.works", name: "U", role: "Associate" } };
  h.logOutreach.mockReset();
});

describe("POST /api/candidates/:id/outreach", () => {
  it("returns 401 when signed out and does not log", async () => {
    h.session = null;
    const res = await POST(req({ channel: "email" }), ctx);
    expect(res.status).toBe(401);
    expect(h.logOutreach).not.toHaveBeenCalled();
  });

  it("201 happy path — forwards the validated input", async () => {
    h.logOutreach.mockResolvedValue({ id: "a1", channel: "email" });
    const res = await POST(req({ channel: "email", note: "hi" }), ctx);
    expect(res.status).toBe(201);
    expect(h.logOutreach).toHaveBeenCalledWith(
      "c1",
      expect.objectContaining({ channel: "email", note: "hi" }),
      expect.objectContaining({ id: "u1" }),
    );
    expect((await res.json()).attempt.id).toBe("a1");
  });

  it("forwards templateId when the send came from the Templates page", async () => {
    h.logOutreach.mockResolvedValue({ id: "a1", channel: "email" });
    await POST(req({ channel: "email", templateId: "initial" }), ctx);
    expect(h.logOutreach).toHaveBeenCalledWith(
      "c1",
      expect.objectContaining({ templateId: "initial" }),
      expect.anything(),
    );
  });

  it("422 on an invalid channel", async () => {
    const res = await POST(req({ channel: "carrier-pigeon" }), ctx);
    expect(res.status).toBe(422);
    expect(h.logOutreach).not.toHaveBeenCalled();
  });

  it("maps a service NOT_FOUND to 404", async () => {
    h.logOutreach.mockRejectedValue(new AppError("NOT_FOUND", "Candidate not found"));
    const res = await POST(req({ channel: "email" }), ctx);
    expect(res.status).toBe(404);
  });
});
