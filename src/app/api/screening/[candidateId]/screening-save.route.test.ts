import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * POST /api/screening/:candidateId — the guarded score+save: unauth → 401 (nothing saved); a
 * valid body → 200 with the scorecard; an unknown top-level key → 422 (strict); a malformed
 * `schedule` value → 422. `screeningService` is mocked (unit-tested separately); auth + zod run
 * for real off the session, mirroring `leads.route.test.ts`'s exact scaffolding.
 */

const h = vi.hoisted(() => ({
  session: null as { user: { id: string; email: string; name: string; role?: string } } | null,
  saveAndMaybeMove: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/server/auth/auth", () => ({ auth: { api: { getSession: async () => h.session } } }));
vi.mock("@/server/db/prisma", () => ({ prisma: {} }));
vi.mock("@/server/services/screening.service", () => ({
  screeningService: { saveAndMaybeMove: h.saveAndMaybeMove },
}));

import { POST } from "./route";

function postReq(body: unknown) {
  return new Request("http://localhost/api/screening/c1", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

function ctx() {
  return { params: Promise.resolve({ candidateId: "c1" }) };
}

beforeEach(() => {
  h.session = { user: { id: "u1", email: "u@desta.works", name: "U", role: "Associate" } };
  h.saveAndMaybeMove.mockReset();
});

describe("POST /api/screening/:candidateId", () => {
  it("returns 401 when signed out and does not save", async () => {
    h.session = null;
    const res = await POST(postReq({ action: "save" }), ctx());
    expect(res.status).toBe(401);
    expect(h.saveAndMaybeMove).not.toHaveBeenCalled();
  });

  it("200 happy path — forwards the validated input and the session user", async () => {
    h.saveAndMaybeMove.mockResolvedValue({
      id: "sc1",
      result: { totalPct: 80, decision: "Advance" },
    });
    const res = await POST(
      postReq({ action: "save", credentialsHeld: ["Active RN License"] }),
      ctx(),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.scorecard).toMatchObject({ id: "sc1" });
    expect(h.saveAndMaybeMove).toHaveBeenCalledWith(
      "c1",
      expect.objectContaining({ action: "save", credentialsHeld: ["Active RN License"] }),
      expect.objectContaining({ id: "u1" }),
    );
  });

  it("422s an unknown top-level key (strict)", async () => {
    const res = await POST(postReq({ action: "save", bogus: true }), ctx());
    expect(res.status).toBe(422);
    expect(h.saveAndMaybeMove).not.toHaveBeenCalled();
  });

  it("422s a malformed schedule value", async () => {
    const res = await POST(postReq({ action: "save", schedule: "Not A Real Option" }), ctx());
    expect(res.status).toBe(422);
    expect(h.saveAndMaybeMove).not.toHaveBeenCalled();
  });
});
