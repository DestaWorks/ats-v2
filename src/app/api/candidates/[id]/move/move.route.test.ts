import { describe, it, expect, beforeEach, vi } from "vitest";
import { AppError } from "@/server/http/app-error";

/**
 * POST /api/candidates/:id/move — the single gated move route: unauth → 401; a gate block from the
 * service → 422 STAGE_BLOCKED (reasons carried in the message); happy path → 200 with the updated
 * candidate DTO. `candidateService.move` is mocked (its gating is unit-tested separately); auth +
 * the DTO projection run for real.
 */

const h = vi.hoisted(() => ({
  session: null as { user: { id: string; email: string; name: string; role?: string } } | null,
  move: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/server/auth/auth", () => ({ auth: { api: { getSession: async () => h.session } } }));
vi.mock("@/server/db/prisma", () => ({ prisma: {} }));
vi.mock("@/server/services/candidate.service", () => ({
  candidateService: { move: h.move },
}));

import { POST } from "./route";

function req(body: unknown) {
  return new Request("http://localhost/api/candidates/c1/move", {
    method: "POST",
    body: JSON.stringify(body),
  });
}
const ctx = { params: Promise.resolve({ id: "c1" }) };

beforeEach(() => {
  h.session = { user: { id: "u1", email: "u@desta.works", name: "U", role: "Owner" } };
  h.move.mockReset();
});

describe("POST /api/candidates/:id/move", () => {
  it("returns 401 when signed out and does not move", async () => {
    h.session = null;
    const res = await POST(req({ toStatus: "CLIENT_INTERVIEW" }), ctx);
    expect(res.status).toBe(401);
    expect(h.move).not.toHaveBeenCalled();
  });

  it("returns 200 with ONLY the pipeline fields — never candidate PII", async () => {
    h.move.mockResolvedValue({
      id: "c1",
      name: "Jane",
      email: "jane@example.com",
      phone: "555-0100",
      status: "CLIENT_INTERVIEW",
      stageOrder: 5,
      stageEnteredAt: new Date("2026-07-04T00:00:00.000Z"),
      licenseNumber: "SECRET",
    });
    const res = await POST(req({ toStatus: "CLIENT_INTERVIEW" }), ctx);
    expect(res.status).toBe(200);
    expect(h.move).toHaveBeenCalledWith(
      "c1",
      "CLIENT_INTERVIEW",
      expect.objectContaining({ id: "u1" }),
    );
    const body = await res.json();
    expect(body.candidate).toMatchObject({ id: "c1", status: "CLIENT_INTERVIEW", stageOrder: 5 });
    // PII must never ride along on a move response (M1).
    expect(body.candidate.email).toBeUndefined();
    expect(body.candidate.name).toBeUndefined();
    expect(body.candidate.licenseNumber).toBeUndefined();
    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain("SECRET");
    expect(serialized).not.toContain("jane@example.com");
  });

  it("maps a STAGE_BLOCKED gate failure to 422 with the joined reasons", async () => {
    h.move.mockRejectedValue(
      new AppError("STAGE_BLOCKED", "Credential required; License state required"),
    );
    const res = await POST(req({ toStatus: "QUALIFIED_PRESCREEN" }), ctx);
    expect(res.status).toBe(422);
    expect((await res.json()).error).toEqual({
      code: "STAGE_BLOCKED",
      message: "Credential required; License state required",
    });
  });

  it("returns 422 for an unknown status (zod)", async () => {
    const res = await POST(req({ toStatus: "NOPE" }), ctx);
    expect(res.status).toBe(422);
    expect(h.move).not.toHaveBeenCalled();
  });
});
