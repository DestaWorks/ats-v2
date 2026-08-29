import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * POST /api/me/avatar — guarded route: unauth → 401; a valid request delegates to
 * `userPreferencesService.uploadAvatar` (decode + Storage upload live in the service, covered by
 * user-preferences.service.test.ts) and returns 200 with `{url}`.
 */

const h = vi.hoisted(() => ({
  session: null as { user: { id: string; email: string; name: string; role?: string } } | null,
  uploadAvatar: vi.fn(),
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
vi.mock("@destaworks/application/user-preferences.service", () => ({
  userPreferencesService: { uploadAvatar: h.uploadAvatar },
}));

import { POST } from "./route";

function req(body: unknown) {
  return new Request("http://localhost/api/me/avatar", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

const validBody = { dataUrl: "data:image/jpeg;base64,Zm9v" };

beforeEach(() => {
  h.session = { user: { id: "u1", email: "u@desta.works", name: "U", role: "Owner" } };
  h.uploadAvatar.mockReset();
});

describe("POST /api/me/avatar", () => {
  it("returns 401 when signed out (no service call)", async () => {
    h.session = null;
    const res = await POST(req(validBody), undefined);
    expect(res.status).toBe(401);
    expect(h.uploadAvatar).not.toHaveBeenCalled();
  });

  it("returns 422 when the body is missing dataUrl", async () => {
    const res = await POST(req({}), undefined);
    expect(res.status).toBe(422);
    expect(h.uploadAvatar).not.toHaveBeenCalled();
  });

  it("delegates to userPreferencesService.uploadAvatar and returns 200", async () => {
    h.uploadAvatar.mockResolvedValue({ url: "https://cdn.example.com/avatars/u1.jpg" });
    const res = await POST(req(validBody), undefined);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ url: "https://cdn.example.com/avatars/u1.jpg" });
    const [user, input] = h.uploadAvatar.mock.calls[0]!;
    expect(user).toMatchObject({ user: { id: "u1" } });
    expect(input).toEqual(validBody);
  });

  it("propagates FEATURE_DISABLED as 503 when storage isn't configured", async () => {
    const { AppError } = await import("@destaworks/integrations/http/app-error");
    h.uploadAvatar.mockRejectedValue(new AppError("FEATURE_DISABLED", "not configured"));
    const res = await POST(req(validBody), undefined);
    expect(res.status).toBe(503);
  });
});
