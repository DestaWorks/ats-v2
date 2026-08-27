import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * POST /api/candidates/:id/resume — attach a resume directly to an already-known candidate (the
 * detail page's own Resume tab, no AI/matching). Unauth → 401; a valid request delegates to
 * `resumeService.attachToCandidate` and returns 201 with the `DocumentSummaryDTO`; a bad body →
 * 422 (candidate existence / NOT_FOUND is covered by resume.service.test.ts).
 */

const h = vi.hoisted(() => ({
  session: null as { user: { id: string; email: string; name: string; role?: string } } | null,
  attachToCandidate: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@destaworks/config/request-context", () => ({
  requestContext: () => ({ headers: async () => new Headers() }),
}));
vi.mock("@destaworks/auth/auth", () => ({ auth: { api: { getSession: async () => h.session } } }));
vi.mock("@destaworks/application/resume.service", () => ({
  resumeService: { attachToCandidate: h.attachToCandidate },
}));

import { POST } from "./route";

function post(body: unknown) {
  return new Request("http://localhost/api/candidates/c1/resume", {
    method: "POST",
    body: JSON.stringify(body),
  });
}
const ctx = { params: Promise.resolve({ id: "c1" }) };

const validBody = { originalFilename: "jane.pdf", mimeType: "application/pdf" };

beforeEach(() => {
  h.session = { user: { id: "u1", email: "u@desta.works", name: "Test User", role: "Associate" } };
  h.attachToCandidate.mockReset();
});

describe("POST /api/candidates/:id/resume", () => {
  it("returns 401 when signed out and does not attach", async () => {
    h.session = null;
    const res = await POST(post(validBody), ctx);
    expect(res.status).toBe(401);
    expect(h.attachToCandidate).not.toHaveBeenCalled();
  });

  it("201 on attach — forwards the candidate id, input, and the session user", async () => {
    h.attachToCandidate.mockResolvedValue({
      id: "d1",
      candidateId: "c1",
      type: "resume",
      originalFilename: "jane.pdf",
      mimeType: "application/pdf",
      sizeBytes: null,
      storageKey: "k1.pdf",
      legacyUrl: null,
      createdAt: new Date("2026-08-11T00:00:00.000Z"),
    });
    const res = await POST(post({ ...validBody, storageKey: "k1.pdf" }), ctx);
    expect(res.status).toBe(201);
    expect(h.attachToCandidate).toHaveBeenCalledWith(
      "c1",
      { ...validBody, storageKey: "k1.pdf" },
      expect.objectContaining({ id: "u1", name: "Test User" }),
    );
    expect((await res.json()).document).toMatchObject({ id: "d1", storageKey: "k1.pdf" });
  });

  it("422 on a missing originalFilename", async () => {
    const res = await POST(post({ mimeType: "application/pdf" }), ctx);
    expect(res.status).toBe(422);
    expect(h.attachToCandidate).not.toHaveBeenCalled();
  });

  it("422 on an oversized extractedText", async () => {
    const res = await POST(post({ ...validBody, extractedText: "x".repeat(100_001) }), ctx);
    expect(res.status).toBe(422);
    expect(h.attachToCandidate).not.toHaveBeenCalled();
  });

  it("propagates NOT_FOUND as 404 when the candidate doesn't exist", async () => {
    const { AppError } = await import("@destaworks/integrations/http/app-error");
    h.attachToCandidate.mockRejectedValue(new AppError("NOT_FOUND", "Candidate not found"));
    const res = await POST(post(validBody), ctx);
    expect(res.status).toBe(404);
  });
});
