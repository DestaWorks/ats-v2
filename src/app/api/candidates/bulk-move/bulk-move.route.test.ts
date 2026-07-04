import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * POST /api/candidates/bulk-move — the gated bulk move: unauth → 401; empty `ids` → 422 (zod);
 * a valid request → 200 with the partial-success summary (`moved` / `blocked`). The no-bypass
 * per-id gating lives in the service unit test; here `candidateService.bulkMove` is mocked.
 */

const h = vi.hoisted(() => ({
  session: null as { user: { id: string; email: string; name: string; role?: string } } | null,
  bulkMove: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/server/auth/auth", () => ({ auth: { api: { getSession: async () => h.session } } }));
vi.mock("@/server/db/prisma", () => ({ prisma: {} }));
vi.mock("@/server/services/candidate.service", () => ({
  candidateService: { bulkMove: h.bulkMove },
}));

import { POST } from "./route";

function req(body: unknown) {
  return new Request("http://localhost/api/candidates/bulk-move", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  h.session = { user: { id: "u1", email: "u@desta.works", name: "U", role: "Associate" } };
  h.bulkMove.mockReset();
});

describe("POST /api/candidates/bulk-move", () => {
  it("returns 401 when signed out and does not move", async () => {
    h.session = null;
    const res = await POST(req({ ids: ["a"], toStatus: "CLIENT_INTERVIEW" }), undefined);
    expect(res.status).toBe(401);
    expect(h.bulkMove).not.toHaveBeenCalled();
  });

  it("returns 422 for an empty ids array (zod)", async () => {
    const res = await POST(req({ ids: [], toStatus: "CLIENT_INTERVIEW" }), undefined);
    expect(res.status).toBe(422);
    expect(h.bulkMove).not.toHaveBeenCalled();
  });

  it("returns 200 with the partial-success summary", async () => {
    const summary = { moved: ["a"], blocked: [{ id: "b", reason: "Credential required" }] };
    h.bulkMove.mockResolvedValue(summary);
    const res = await POST(req({ ids: ["a", "b"], toStatus: "QUALIFIED_PRESCREEN" }), undefined);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(summary);
    expect(h.bulkMove).toHaveBeenCalledWith(
      ["a", "b"],
      "QUALIFIED_PRESCREEN",
      expect.objectContaining({ id: "u1" }),
    );
  });
});
