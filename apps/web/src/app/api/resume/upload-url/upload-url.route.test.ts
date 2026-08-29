import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * POST /api/resume/upload-url — guarded route: unauth → 401; a valid request delegates to
 * `resumeService.requestUploadUrl` (storage-key construction + signed-URL creation live in the
 * service, covered by resume.service.test.ts) and returns 200 with `{signedUrl, storageKey}`.
 */

const h = vi.hoisted(() => ({
  session: null as { user: { id: string; email: string; name: string; role?: string } } | null,
  requestUploadUrl: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@destaworks/config/request-context", () => ({
  requestContext: () => ({ headers: async () => new Headers(), cookie: async () => undefined }),
}));
vi.mock("@destaworks/auth/auth", () => ({ auth: { api: { getSession: async () => h.session } } }));
vi.mock("@destaworks/db/memberships", async () => ({
  membershipReader: (
    await import("@destaworks/auth/testing/membership-double")
  ).singleTenantMembershipReader(() => h.session),
}));
vi.mock("@destaworks/application/resume.service", () => ({
  resumeService: { requestUploadUrl: h.requestUploadUrl },
}));

import { POST } from "./route";

function req(body: unknown) {
  return new Request("http://localhost/api/resume/upload-url", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

const validBody = { filename: "jane.pdf", mimeType: "application/pdf" };

beforeEach(() => {
  h.session = { user: { id: "u1", email: "u@desta.works", name: "U", role: "Owner" } };
  h.requestUploadUrl.mockReset();
});

describe("POST /api/resume/upload-url", () => {
  it("returns 401 when signed out (no service call)", async () => {
    h.session = null;
    const res = await POST(req(validBody), undefined);
    expect(res.status).toBe(401);
    expect(h.requestUploadUrl).not.toHaveBeenCalled();
  });

  it("returns 422 when the body is missing required fields", async () => {
    const res = await POST(req({}), undefined);
    expect(res.status).toBe(422);
    expect(h.requestUploadUrl).not.toHaveBeenCalled();
  });

  it("returns 422 for a mimeType outside the PDF/plain-text allowlist", async () => {
    const res = await POST(req({ filename: "resume.svg", mimeType: "image/svg+xml" }), undefined);
    expect(res.status).toBe(422);
    expect(h.requestUploadUrl).not.toHaveBeenCalled();
  });

  it("delegates to resumeService.requestUploadUrl and returns 200", async () => {
    h.requestUploadUrl.mockResolvedValue({ signedUrl: "https://x/upload", storageKey: "k1.pdf" });
    const res = await POST(req(validBody), undefined);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ signedUrl: "https://x/upload", storageKey: "k1.pdf" });
    expect(h.requestUploadUrl).toHaveBeenCalledWith(validBody);
  });

  it("propagates FEATURE_DISABLED as 503 when storage isn't configured", async () => {
    const { AppError } = await import("@destaworks/integrations/http/app-error");
    h.requestUploadUrl.mockRejectedValue(new AppError("FEATURE_DISABLED", "not configured"));
    const res = await POST(req(validBody), undefined);
    expect(res.status).toBe(503);
    expect((await res.json()).error.code).toBe("FEATURE_DISABLED");
  });
});
