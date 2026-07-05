import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * GET /api/activity + GET /api/activity/[id] — the Activity Log endpoints. Auth (real guard off the
 * mocked session) + zod + the cursor plumbing run for real; `auditService` is mocked (unit-tested
 * separately). Proves: unauth → 401; a non-`viewAudit` role → 403 (the route's `requireCapability`,
 * defense-in-depth over the service gate); a bad date filter → 422 (zod); a malformed cursor → 400;
 * a valid request forwards the parsed filters + decoded cursor; the detail route 404s an unknown id.
 */

const h = vi.hoisted(() => ({
  session: null as { user: { id: string; email: string; name: string; role?: string } } | null,
  listActivity: vi.fn(),
  getActivityDetail: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/server/auth/auth", () => ({ auth: { api: { getSession: async () => h.session } } }));
vi.mock("@/server/db/prisma", () => ({ prisma: {} }));
vi.mock("@/server/services/audit.service", () => ({
  auditService: { listActivity: h.listActivity, getActivityDetail: h.getActivityDetail },
}));

import { GET as GET_LIST } from "./route";
import { GET as GET_DETAIL } from "./[id]/route";
import { AppError } from "@/server/http/app-error";

const LIST = { items: [], nextCursor: null, hasMore: false };

function listReq(query = "") {
  return new Request(`http://localhost/api/activity${query}`);
}

beforeEach(() => {
  h.session = { user: { id: "u1", email: "u@desta.works", name: "U", role: "Owner" } };
  h.listActivity.mockReset().mockResolvedValue(LIST);
  h.getActivityDetail.mockReset().mockResolvedValue({ id: "a1", before: null, after: null });
});

describe("GET /api/activity", () => {
  it("401 when signed out and does not read the list", async () => {
    h.session = null;
    const res = await GET_LIST(listReq(), undefined);
    expect(res.status).toBe(401);
    expect(h.listActivity).not.toHaveBeenCalled();
  });

  it("403 for a non-viewAudit role (Associate) — route-level guard, nothing read", async () => {
    h.session = { user: { id: "u2", email: "a@desta.works", name: "A", role: "Associate" } };
    const res = await GET_LIST(listReq(), undefined);
    expect(res.status).toBe(403);
    expect(h.listActivity).not.toHaveBeenCalled();
  });

  it("422 for an invalid action value (zod)", async () => {
    const res = await GET_LIST(listReq("?action=frobnicate"), undefined);
    expect(res.status).toBe(422);
    expect(h.listActivity).not.toHaveBeenCalled();
  });

  it("422 for an unparseable date (zod)", async () => {
    const res = await GET_LIST(listReq("?from=not-a-date"), undefined);
    expect(res.status).toBe(422);
    expect(h.listActivity).not.toHaveBeenCalled();
  });

  it("400 on a malformed cursor", async () => {
    const res = await GET_LIST(listReq("?cursor=garbage!!!"), undefined);
    expect(res.status).toBe(400);
    expect(h.listActivity).not.toHaveBeenCalled();
  });

  it("200 and forwards the parsed filters (no cursor)", async () => {
    const res = await GET_LIST(listReq("?action=purge&entity=candidate&actor=u9"), undefined);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(LIST);
    const [filters, cursor] = h.listActivity.mock.calls[0]!;
    expect(filters).toMatchObject({ action: "purge", entity: "candidate", actor: "u9" });
    expect(cursor).toBeNull();
  });

  it("decodes a valid at_desc cursor and forwards it", async () => {
    const cursor = Buffer.from(JSON.stringify(["2026-06-01T00:00:00.000Z", "a1"])).toString(
      "base64url",
    );
    const res = await GET_LIST(listReq(`?cursor=${cursor}`), undefined);
    expect(res.status).toBe(200);
    const [, decoded] = h.listActivity.mock.calls[0]!;
    expect(decoded).toMatchObject({ kind: "at", value: "2026-06-01T00:00:00.000Z", id: "a1" });
  });
});

describe("GET /api/activity/[id]", () => {
  function ctx(id = "a1") {
    return { params: Promise.resolve({ id }) };
  }

  it("403 for a non-viewAudit role and reads nothing", async () => {
    h.session = { user: { id: "u2", email: "a@desta.works", name: "A", role: "Associate" } };
    const res = await GET_DETAIL(new Request("http://localhost/api/activity/a1"), ctx());
    expect(res.status).toBe(403);
    expect(h.getActivityDetail).not.toHaveBeenCalled();
  });

  it("404 when the service reports NOT_FOUND", async () => {
    h.getActivityDetail.mockRejectedValue(new AppError("NOT_FOUND", "Activity entry not found"));
    const res = await GET_DETAIL(new Request("http://localhost/api/activity/nope"), ctx("nope"));
    expect(res.status).toBe(404);
  });

  it("200 with { before, after } for a holder", async () => {
    h.getActivityDetail.mockResolvedValue({ id: "a1", before: { x: 1 }, after: { x: 2 } });
    const res = await GET_DETAIL(new Request("http://localhost/api/activity/a1"), ctx());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: "a1", before: { x: 1 }, after: { x: 2 } });
    expect(h.getActivityDetail).toHaveBeenCalledWith("a1");
  });
});
