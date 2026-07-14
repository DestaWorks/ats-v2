import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * POST /api/resume/extract — end-to-end guarded route with a MOCKED provider wrapper (never a real
 * LLM call, §8): unauth → 401; key-absent → FEATURE_DISABLED 503; short text → 422; happy path →
 * 200 with `{variant, data, match}`; provider failure → EXTRACTION_FAILED 502. Provider-agnostic.
 */

const h = vi.hoisted(() => ({
  session: null as { user: { id: string; email: string; name: string; role?: string } } | null,
  enabled: true,
  gen: vi.fn(),
  list: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/server/auth/auth", () => ({ auth: { api: { getSession: async () => h.session } } }));
vi.mock("@/server/db/prisma", () => ({ prisma: {} }));
vi.mock("@/server/repositories/candidate.repository", () => ({
  candidateRepository: { list: h.list },
}));
vi.mock("@/server/ai/config", () => ({
  get aiEnabled() {
    return h.enabled;
  },
}));
vi.mock("@/server/ai/provider", () => ({ generateStructured: h.gen }));

import { POST } from "./route";

const LONG_TEXT = "Jane Doe résumé ".repeat(10); // > 50 chars

function req(body: unknown) {
  return new Request("http://localhost/api/resume/extract", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  h.session = { user: { id: "u1", email: "u@desta.works", name: "U", role: "Owner" } };
  h.enabled = true;
  h.gen.mockReset();
  h.list.mockReset();
  h.list.mockResolvedValue([]);
});

describe("POST /api/resume/extract", () => {
  it("returns 401 when signed out", async () => {
    h.session = null;
    const res = await POST(req({ variant: "clinical", text: LONG_TEXT }), undefined);
    expect(res.status).toBe(401);
  });

  it("returns FEATURE_DISABLED 503 when the key is absent", async () => {
    h.enabled = false;
    const res = await POST(req({ variant: "clinical", text: LONG_TEXT }), undefined);
    expect(res.status).toBe(503);
    expect((await res.json()).error.code).toBe("FEATURE_DISABLED");
    expect(h.gen).not.toHaveBeenCalled();
  });

  it("returns 422 for text below the minimum length", async () => {
    const res = await POST(req({ variant: "clinical", text: "too short" }), undefined);
    expect(res.status).toBe(422);
    expect(h.gen).not.toHaveBeenCalled();
  });

  it("returns 200 with {variant, data, match} on success", async () => {
    const data = { name: "Jane Doe", email: "jane@example.com" };
    h.gen.mockResolvedValue(data);
    const res = await POST(req({ variant: "clinical", text: LONG_TEXT }), undefined);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ variant: "clinical", data, match: { status: "none" } });
  });

  it("returns EXTRACTION_FAILED 502 when the provider fails", async () => {
    h.gen.mockRejectedValue(new Error("provider error"));
    const res = await POST(req({ variant: "clinical", text: LONG_TEXT }), undefined);
    expect(res.status).toBe(502);
    expect((await res.json()).error.code).toBe("EXTRACTION_FAILED");
  });
});
