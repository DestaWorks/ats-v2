import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * POST /api/sourcing/similar — the guarded find-similar read: unauth → 401; a valid body → 200
 * with the service's result; an unknown key → 422 (strict). `similarityService` is mocked
 * (unit-tested separately); auth + zod run for real.
 */

const h = vi.hoisted(() => ({
  session: null as { user: { id: string; email: string; name: string; role?: string } } | null,
  findSimilar: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/server/auth/auth", () => ({ auth: { api: { getSession: async () => h.session } } }));
vi.mock("@/server/db/prisma", () => ({ prisma: {} }));
vi.mock("@/server/services/similarity.service", () => ({
  similarityService: { findSimilar: h.findSimilar },
}));

import { POST } from "./route";

function postReq(body: unknown) {
  return new Request("http://localhost/api/sourcing/similar", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  h.session = { user: { id: "u1", email: "u@desta.works", name: "U", role: "Associate" } };
  h.findSimilar.mockReset();
});

describe("POST /api/sourcing/similar", () => {
  it("returns 401 when signed out and does not search", async () => {
    h.session = null;
    const res = await POST(postReq({ credential: "PMHNP", state: "CT" }), undefined);
    expect(res.status).toBe(401);
    expect(h.findSimilar).not.toHaveBeenCalled();
  });

  it("200 happy path — forwards the validated input and returns the service result", async () => {
    h.findSimilar.mockResolvedValue({ taxonomyLabel: "Psychiatric NP (PMHNP)", results: [] });
    const res = await POST(postReq({ credential: "PMHNP", state: "CT" }), undefined);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ taxonomyLabel: "Psychiatric NP (PMHNP)", results: [] });
    expect(h.findSimilar).toHaveBeenCalledWith(
      { credential: "PMHNP", state: "CT" },
      expect.objectContaining({ id: "u1" }),
    );
  });

  it("422s an unknown top-level key (strict)", async () => {
    const res = await POST(postReq({ credential: "PMHNP", bogus: true }), undefined);
    expect(res.status).toBe(422);
    expect(h.findSimilar).not.toHaveBeenCalled();
  });
});
