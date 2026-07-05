import { describe, it, expect, beforeEach, vi } from "vitest";
import { AppError } from "@/server/http/app-error";

/**
 * PATCH /api/candidates/:id — the profile edit route: unauth → 401; happy → 200 with the
 * PII-re-gated candidate; a `status`/pipeline key in the body → 422 (strict schema, movement stays
 * owned by `move`); `licenseNumber` without `viewCredentials` → 403; NOT_FOUND → 404.
 * `candidateService.update` is mocked; auth + zod + the DTO re-gate run for real.
 */

const h = vi.hoisted(() => ({
  session: null as { user: { id: string; email: string; name: string; role?: string } } | null,
  update: vi.fn(),
  softDelete: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/server/auth/auth", () => ({ auth: { api: { getSession: async () => h.session } } }));
vi.mock("@/server/db/prisma", () => ({ prisma: {} }));
vi.mock("@/server/services/candidate.service", () => ({
  candidateService: { update: h.update, softDelete: h.softDelete },
}));

import { PATCH, DELETE } from "./route";

function req(body: unknown) {
  return new Request("http://localhost/api/candidates/c1", {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}
const ctx = { params: Promise.resolve({ id: "c1" }) };

beforeEach(() => {
  h.session = { user: { id: "u1", email: "u@desta.works", name: "U", role: "Associate" } };
  h.update.mockReset();
  h.softDelete.mockReset();
});

describe("PATCH /api/candidates/:id", () => {
  it("returns 401 when signed out and does not update", async () => {
    h.session = null;
    const res = await PATCH(req({ name: "New" }), ctx);
    expect(res.status).toBe(401);
    expect(h.update).not.toHaveBeenCalled();
  });

  it("200 happy path — forwards the input + user; response candidate is PII-re-gated", async () => {
    h.update.mockResolvedValue({
      id: "c1",
      name: "New",
      licenseNumber: "SECRET",
      stageEnteredAt: new Date("2026-07-04T00:00:00.000Z"),
      createdAt: new Date("2026-06-01T00:00:00.000Z"),
      updatedAt: new Date("2026-06-01T00:00:00.000Z"),
    });
    const res = await PATCH(req({ name: "New", city: "Trenton" }), ctx);
    expect(res.status).toBe(200);
    expect(h.update).toHaveBeenCalledWith(
      "c1",
      { name: "New", city: "Trenton" },
      expect.objectContaining({ id: "u1", role: "Associate" }),
    );
    const body = await res.json();
    // Associate has no viewCredentials → licenseNumber must be stripped on the way out.
    expect(body.candidate.name).toBe("New");
    expect(body.candidate.licenseNumber).toBeUndefined();
    expect(JSON.stringify(body)).not.toContain("SECRET");
  });

  it("422 when the body tries to change a pipeline field (strict schema)", async () => {
    const res = await PATCH(req({ status: "CLIENT_INTERVIEW" }), ctx);
    expect(res.status).toBe(422);
    expect(h.update).not.toHaveBeenCalled();
  });

  it("403 when licenseNumber is present without viewCredentials", async () => {
    const res = await PATCH(req({ licenseNumber: "LIC-1" }), ctx);
    expect(res.status).toBe(403);
    expect(h.update).not.toHaveBeenCalled();
  });

  it("allows licenseNumber for a viewCredentials viewer (Owner)", async () => {
    h.session = { user: { id: "o1", email: "o@desta.works", name: "O", role: "Owner" } };
    h.update.mockResolvedValue({
      id: "c1",
      name: "N",
      licenseNumber: "LIC-1",
      stageEnteredAt: new Date("2026-07-04T00:00:00.000Z"),
      createdAt: new Date("2026-06-01T00:00:00.000Z"),
      updatedAt: new Date("2026-06-01T00:00:00.000Z"),
    });
    const res = await PATCH(req({ licenseNumber: "LIC-1" }), ctx);
    expect(res.status).toBe(200);
    expect(h.update).toHaveBeenCalledWith(
      "c1",
      { licenseNumber: "LIC-1" },
      expect.objectContaining({ role: "Owner" }),
    );
    // Owner has viewCredentials → the number rides back out.
    expect((await res.json()).candidate.licenseNumber).toBe("LIC-1");
  });

  it("maps a service NOT_FOUND to 404", async () => {
    h.update.mockRejectedValue(new AppError("NOT_FOUND", "Candidate not found"));
    const res = await PATCH(req({ name: "New" }), ctx);
    expect(res.status).toBe(404);
  });

  it("422 on a bad enum value", async () => {
    const res = await PATCH(req({ credential: "NOT_A_CRED" }), ctx);
    expect(res.status).toBe(422);
    expect(h.update).not.toHaveBeenCalled();
  });
});

function delReq() {
  return new Request("http://localhost/api/candidates/c1", { method: "DELETE" });
}

describe("DELETE /api/candidates/:id — soft-delete", () => {
  it("returns 401 when signed out and does not soft-delete", async () => {
    h.session = null;
    const res = await DELETE(delReq(), ctx);
    expect(res.status).toBe(401);
    expect(h.softDelete).not.toHaveBeenCalled();
  });

  it("200 happy path — soft-deletes and returns { ok, id } (no PII)", async () => {
    h.softDelete.mockResolvedValue({ id: "c1", deletedAt: new Date() });
    const res = await DELETE(delReq(), ctx);
    expect(res.status).toBe(200);
    expect(h.softDelete).toHaveBeenCalledWith("c1");
    expect(await res.json()).toEqual({ ok: true, id: "c1" });
  });

  it("maps a service NOT_FOUND to 404", async () => {
    h.softDelete.mockRejectedValue(new AppError("NOT_FOUND", "Candidate not found"));
    const res = await DELETE(delReq(), ctx);
    expect(res.status).toBe(404);
  });
});
