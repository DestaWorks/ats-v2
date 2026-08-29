import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * GET/PATCH /api/me/learn-progress (Wave 5.4, Learn tutorial) — own-record only, no id param.
 * Unauth → 401 on both; GET returns the mocked service's progress map; PATCH validates the
 * chapterId against the real LEARN_CHAPTERS ids and forwards to the service.
 */

const h = vi.hoisted(() => ({
  session: null as { user: { id: string; email: string; name: string; role?: string } } | null,
  getMine: vi.fn(),
  setChapter: vi.fn(),
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
vi.mock("@destaworks/db/prisma", () => ({ prisma: {} }));
vi.mock("@destaworks/application/learn.service", () => ({
  learnService: { getMine: h.getMine, setChapter: h.setChapter },
}));

import { GET, PATCH } from "./route";

function patchReq(body: unknown) {
  return new Request("http://localhost/api/me/learn-progress", {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}
const getReq = () => new Request("http://localhost/api/me/learn-progress");

beforeEach(() => {
  h.session = { user: { id: "u1", email: "u@desta.works", name: "U", role: "Associate" } };
  h.getMine.mockReset();
  h.setChapter.mockReset();
});

describe("GET /api/me/learn-progress", () => {
  it("returns 401 when signed out", async () => {
    h.session = null;
    const res = await GET(getReq(), undefined);
    expect(res.status).toBe(401);
    expect(h.getMine).not.toHaveBeenCalled();
  });

  it("200 with the service's progress map for the session user", async () => {
    h.getMine.mockResolvedValue({ overview: "2026-07-01T00:00:00.000Z" });
    const res = await GET(getReq(), undefined);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ overview: "2026-07-01T00:00:00.000Z" });
    expect(h.getMine).toHaveBeenCalledWith(
      expect.objectContaining({ user: expect.objectContaining({ id: "u1" }) }),
    );
  });
});

describe("PATCH /api/me/learn-progress", () => {
  it("returns 401 when signed out and does not update", async () => {
    h.session = null;
    const res = await PATCH(patchReq({ chapterId: "overview", done: true }), undefined);
    expect(res.status).toBe(401);
    expect(h.setChapter).not.toHaveBeenCalled();
  });

  it("200 forwards the validated chapterId/done to the service", async () => {
    h.setChapter.mockResolvedValue({ overview: "2026-07-01T00:00:00.000Z" });
    const res = await PATCH(patchReq({ chapterId: "overview", done: true }), undefined);
    expect(res.status).toBe(200);
    expect(h.setChapter).toHaveBeenCalledWith(
      expect.objectContaining({ user: expect.objectContaining({ id: "u1" }) }),
      "overview",
      true,
    );
  });

  it("422 on a chapterId that isn't a real chapter", async () => {
    const res = await PATCH(patchReq({ chapterId: "not-a-real-chapter", done: true }), undefined);
    expect(res.status).toBe(422);
    expect(h.setChapter).not.toHaveBeenCalled();
  });

  it("422 when done is missing", async () => {
    const res = await PATCH(patchReq({ chapterId: "overview" }), undefined);
    expect(res.status).toBe(422);
  });

  it("422 on an unknown key (.strict())", async () => {
    const res = await PATCH(patchReq({ chapterId: "overview", done: true, extra: "x" }), undefined);
    expect(res.status).toBe(422);
  });
});
