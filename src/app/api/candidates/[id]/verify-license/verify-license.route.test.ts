import { describe, it, expect, beforeEach, vi } from "vitest";
import { AppError } from "@/server/http/app-error";

/**
 * POST /api/candidates/:id/verify-license — unauth → 401; happy → 200 (OPEN to a no-capability
 * operator, proving a Screener/Associate can verify and unblock the pipeline); `licenseNumber`
 * without `viewCredentials` → 403; bad `licenseStatus` → 422; NOT_FOUND → 404.
 * `candidateService.verifyLicense` is mocked; auth + zod + the DTO re-gate run for real.
 */

const h = vi.hoisted(() => ({
  session: null as { user: { id: string; email: string; name: string; role?: string } } | null,
  verifyLicense: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/server/auth/auth", () => ({ auth: { api: { getSession: async () => h.session } } }));
vi.mock("@/server/db/prisma", () => ({ prisma: {} }));
vi.mock("@/server/services/candidate.service", () => ({
  candidateService: { verifyLicense: h.verifyLicense },
}));

import { POST } from "./route";

function req(body: unknown) {
  return new Request("http://localhost/api/candidates/c1/verify-license", {
    method: "POST",
    body: JSON.stringify(body),
  });
}
const ctx = { params: Promise.resolve({ id: "c1" }) };

beforeEach(() => {
  // Default: a no-capability operator (Associate).
  h.session = { user: { id: "u1", email: "u@desta.works", name: "U", role: "Associate" } };
  h.verifyLicense.mockReset();
});

describe("POST /api/candidates/:id/verify-license", () => {
  it("returns 401 when signed out and does not verify", async () => {
    h.session = null;
    const res = await POST(req({ licenseStatus: "Active" }), ctx);
    expect(res.status).toBe(401);
    expect(h.verifyLicense).not.toHaveBeenCalled();
  });

  it("200 for a no-capability operator (Screener/Associate CAN verify)", async () => {
    h.verifyLicense.mockResolvedValue({
      id: "c1",
      licenseStatus: "Active",
      licenseNumber: "SECRET",
      stageEnteredAt: new Date("2026-07-04T00:00:00.000Z"),
      createdAt: new Date("2026-06-01T00:00:00.000Z"),
      updatedAt: new Date("2026-06-01T00:00:00.000Z"),
    });
    const res = await POST(req({ licenseStatus: "Active" }), ctx);
    expect(res.status).toBe(200);
    expect(h.verifyLicense).toHaveBeenCalledWith(
      "c1",
      { licenseStatus: "Active" },
      expect.objectContaining({ id: "u1", role: "Associate" }),
    );
    const body = await res.json();
    // Associate lacks viewCredentials → licenseNumber stripped from the response.
    expect(body.candidate.licenseStatus).toBe("Active");
    expect(body.candidate.licenseNumber).toBeUndefined();
    expect(JSON.stringify(body)).not.toContain("SECRET");
  });

  it("403 when licenseNumber is present without viewCredentials", async () => {
    const res = await POST(req({ licenseStatus: "Active", licenseNumber: "LIC-1" }), ctx);
    expect(res.status).toBe(403);
    expect(h.verifyLicense).not.toHaveBeenCalled();
  });

  it("allows licenseNumber for a viewCredentials viewer (Owner)", async () => {
    h.session = { user: { id: "o1", email: "o@desta.works", name: "O", role: "Owner" } };
    h.verifyLicense.mockResolvedValue({
      id: "c1",
      licenseStatus: "Active",
      licenseNumber: "LIC-1",
      stageEnteredAt: new Date("2026-07-04T00:00:00.000Z"),
      createdAt: new Date("2026-06-01T00:00:00.000Z"),
      updatedAt: new Date("2026-06-01T00:00:00.000Z"),
    });
    const res = await POST(req({ licenseStatus: "Active", licenseNumber: "LIC-1" }), ctx);
    expect(res.status).toBe(200);
    expect(h.verifyLicense).toHaveBeenCalledWith(
      "c1",
      expect.objectContaining({ licenseStatus: "Active", licenseNumber: "LIC-1" }),
      expect.objectContaining({ role: "Owner" }),
    );
  });

  it("422 on a bad licenseStatus enum", async () => {
    const res = await POST(req({ licenseStatus: "Bogus" }), ctx);
    expect(res.status).toBe(422);
    expect(h.verifyLicense).not.toHaveBeenCalled();
  });

  it("maps a service NOT_FOUND to 404", async () => {
    h.verifyLicense.mockRejectedValue(new AppError("NOT_FOUND", "Candidate not found"));
    const res = await POST(req({ licenseStatus: "Active" }), ctx);
    expect(res.status).toBe(404);
  });
});
