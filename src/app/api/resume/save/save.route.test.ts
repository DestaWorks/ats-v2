import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * POST /api/resume/save — guarded route: unauth → 401; a valid request delegates to
 * `resumeService.save` (recompute-match + attach/create + document + audit live in the service,
 * covered by resume.service.test.ts) and returns 200 with the candidate + document DTOs.
 */

const h = vi.hoisted(() => ({
  session: null as { user: { id: string; email: string; name: string; role?: string } } | null,
  save: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/server/auth/auth", () => ({ auth: { api: { getSession: async () => h.session } } }));
vi.mock("@/server/services/resume.service", () => ({ resumeService: { save: h.save } }));

import { POST } from "./route";

function req(body: unknown) {
  return new Request("http://localhost/api/resume/save", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

const validBody = {
  variant: "clinical",
  data: { name: "Jane Doe" },
  originalFilename: "jane.pdf",
  mimeType: "application/pdf",
  extractedText: "raw text",
};

beforeEach(() => {
  h.session = { user: { id: "u1", email: "u@desta.works", name: "U", role: "Owner" } };
  h.save.mockReset();
});

describe("POST /api/resume/save", () => {
  it("returns 401 when signed out (no service call)", async () => {
    h.session = null;
    const res = await POST(req(validBody), undefined);
    expect(res.status).toBe(401);
    expect(h.save).not.toHaveBeenCalled();
  });

  it("delegates to resumeService.save and returns 200 with the result", async () => {
    h.save.mockResolvedValue({ candidate: { id: "c1" }, document: { id: "d1" } });
    const res = await POST(req(validBody), undefined);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ candidate: { id: "c1" }, document: { id: "d1" } });
    // The route forwards the authenticated user to the service.
    const [, user] = h.save.mock.calls[0]!;
    expect(user).toMatchObject({ id: "u1", role: "Owner" });
  });
});
