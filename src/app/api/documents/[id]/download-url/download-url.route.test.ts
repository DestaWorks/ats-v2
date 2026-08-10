import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * GET /api/documents/:id/download-url — real `requireCapability("viewCredentials")` runs against
 * the mocked session (defense-in-depth over the service layer, same pattern as activity.route.test.ts):
 * unauth → 401; a non-`viewCredentials` role (Associate) → 403; a leadership role delegates to
 * `resumeService.getDownloadUrl` and returns 200.
 */

const h = vi.hoisted(() => ({
  session: null as { user: { id: string; email: string; name: string; role?: string } } | null,
  getDownloadUrl: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/server/auth/auth", () => ({ auth: { api: { getSession: async () => h.session } } }));
vi.mock("@/server/services/resume.service", () => ({
  resumeService: { getDownloadUrl: h.getDownloadUrl },
}));

import { GET } from "./route";

function req() {
  return new Request("http://localhost/api/documents/d1/download-url");
}
function ctx() {
  return { params: Promise.resolve({ id: "d1" }) };
}

beforeEach(() => {
  h.session = { user: { id: "u1", email: "u@desta.works", name: "U", role: "Owner" } };
  h.getDownloadUrl.mockReset();
});

describe("GET /api/documents/:id/download-url", () => {
  it("returns 401 when signed out (no service call)", async () => {
    h.session = null;
    const res = await GET(req(), ctx());
    expect(res.status).toBe(401);
    expect(h.getDownloadUrl).not.toHaveBeenCalled();
  });

  it("returns 403 for a role without viewCredentials (no service call)", async () => {
    h.session = { user: { id: "u1", email: "u@desta.works", name: "U", role: "Associate" } };
    const res = await GET(req(), ctx());
    expect(res.status).toBe(403);
    expect(h.getDownloadUrl).not.toHaveBeenCalled();
  });

  it("delegates to resumeService.getDownloadUrl and returns 200 for a leadership role", async () => {
    h.getDownloadUrl.mockResolvedValue({ url: "https://x/download?sig=1" });
    const res = await GET(req(), ctx());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ url: "https://x/download?sig=1" });
    expect(h.getDownloadUrl).toHaveBeenCalledWith("d1");
  });

  it("returns 404 when the document has no stored file", async () => {
    const { AppError } = await import("@/server/http/app-error");
    h.getDownloadUrl.mockRejectedValue(new AppError("NOT_FOUND", "No stored file"));
    const res = await GET(req(), ctx());
    expect(res.status).toBe(404);
  });
});
