import { describe, it, expect, beforeEach, vi } from "vitest";
import { AppError } from "@/server/http/app-error";

/**
 * POST /api/candidates/:id/restore — unauth → 401; happy → 200 with the PII-re-gated candidate;
 * a `CONFLICT` from the service (candidate not in Trash) → 409. `candidateService.restore` is
 * mocked; auth + the DTO re-gate run for real.
 */

const h = vi.hoisted(() => ({
  session: null as { user: { id: string; email: string; name: string; role?: string } } | null,
  restore: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/server/auth/auth", () => ({ auth: { api: { getSession: async () => h.session } } }));
vi.mock("@/server/db/prisma", () => ({ prisma: {} }));
vi.mock("@/server/services/candidate.service", () => ({
  candidateService: { restore: h.restore },
}));

import { POST } from "./route";

function req() {
  return new Request("http://localhost/api/candidates/c1/restore", { method: "POST" });
}
const ctx = { params: Promise.resolve({ id: "c1" }) };

beforeEach(() => {
  h.session = { user: { id: "u1", email: "u@desta.works", name: "U", role: "Associate" } };
  h.restore.mockReset();
});

describe("POST /api/candidates/:id/restore", () => {
  it("returns 401 when signed out and does not restore", async () => {
    h.session = null;
    const res = await POST(req(), ctx);
    expect(res.status).toBe(401);
    expect(h.restore).not.toHaveBeenCalled();
  });

  it("200 happy path — forwards id + user; response candidate is PII-re-gated", async () => {
    h.restore.mockResolvedValue({
      id: "c1",
      name: "Jane",
      licenseNumber: "SECRET",
      stageEnteredAt: new Date("2026-07-04T00:00:00.000Z"),
      createdAt: new Date("2026-06-01T00:00:00.000Z"),
      updatedAt: new Date("2026-06-01T00:00:00.000Z"),
    });
    const res = await POST(req(), ctx);
    expect(res.status).toBe(200);
    expect(h.restore).toHaveBeenCalledWith("c1", expect.objectContaining({ id: "u1" }));
    const body = await res.json();
    // Associate has no viewCredentials → licenseNumber stripped on the way out.
    expect(body.candidate.name).toBe("Jane");
    expect(body.candidate.licenseNumber).toBeUndefined();
    expect(JSON.stringify(body)).not.toContain("SECRET");
  });

  it("maps a service CONFLICT (not in Trash) to 409", async () => {
    h.restore.mockRejectedValue(new AppError("CONFLICT", "Candidate is not in Trash"));
    const res = await POST(req(), ctx);
    expect(res.status).toBe(409);
  });

  it("maps a service NOT_FOUND to 404", async () => {
    h.restore.mockRejectedValue(new AppError("NOT_FOUND", "Candidate not found"));
    const res = await POST(req(), ctx);
    expect(res.status).toBe(404);
  });
});
