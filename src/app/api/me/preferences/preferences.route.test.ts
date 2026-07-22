import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * GET/PATCH /api/me/preferences (Wave 4.1, Templates) — own-record only, no id param. Unauth →
 * 401 on both; GET returns the mocked service's DTO; PATCH validates + forwards the body.
 */

const h = vi.hoisted(() => ({
  session: null as { user: { id: string; email: string; name: string; role?: string } } | null,
  getMine: vi.fn(),
  updateMine: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/server/auth/auth", () => ({ auth: { api: { getSession: async () => h.session } } }));
vi.mock("@/server/db/prisma", () => ({ prisma: {} }));
vi.mock("@/server/services/user-preferences.service", () => ({
  userPreferencesService: { getMine: h.getMine, updateMine: h.updateMine },
}));

import { GET, PATCH } from "./route";

function patchReq(body: unknown) {
  return new Request("http://localhost/api/me/preferences", {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}
const getReq = () => new Request("http://localhost/api/me/preferences");

beforeEach(() => {
  h.session = { user: { id: "u1", email: "u@desta.works", name: "U", role: "Associate" } };
  h.getMine.mockReset();
  h.updateMine.mockReset();
});

describe("GET /api/me/preferences", () => {
  it("returns 401 when signed out", async () => {
    h.session = null;
    const res = await GET(getReq(), undefined);
    expect(res.status).toBe(401);
    expect(h.getMine).not.toHaveBeenCalled();
  });

  it("200 with the service's DTO for the session user", async () => {
    h.getMine.mockResolvedValue({ emailSignature: "Best,\nU", stickyNote: null });
    const res = await GET(getReq(), undefined);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ emailSignature: "Best,\nU", stickyNote: null });
    expect(h.getMine).toHaveBeenCalledWith(expect.objectContaining({ id: "u1" }));
  });
});

describe("PATCH /api/me/preferences", () => {
  it("returns 401 when signed out and does not update", async () => {
    h.session = null;
    const res = await PATCH(patchReq({ stickyNote: "hi" }), undefined);
    expect(res.status).toBe(401);
    expect(h.updateMine).not.toHaveBeenCalled();
  });

  it("200 forwards the validated body to the service", async () => {
    h.updateMine.mockResolvedValue({ emailSignature: null, stickyNote: "hi" });
    const res = await PATCH(patchReq({ stickyNote: "hi" }), undefined);
    expect(res.status).toBe(200);
    expect(h.updateMine).toHaveBeenCalledWith(
      expect.objectContaining({ id: "u1" }),
      expect.objectContaining({ stickyNote: "hi" }),
    );
  });

  it("422 when neither field is provided", async () => {
    const res = await PATCH(patchReq({}), undefined);
    expect(res.status).toBe(422);
    expect(h.updateMine).not.toHaveBeenCalled();
  });

  it("422 on an unknown key (.strict())", async () => {
    const res = await PATCH(patchReq({ favoriteColor: "blue" }), undefined);
    expect(res.status).toBe(422);
  });
});
