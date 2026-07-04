import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * POST/GET /api/candidates/:id/notes — add + role-scoped list. Unauth → 401 on both; add → 201 with
 * the created note (author from the session, never the client body); empty/oversized/bad-type body
 * → 422; list → 200 (server-scoped, never client-filtered). `noteService` is mocked; auth + zod run
 * for real.
 */

const h = vi.hoisted(() => ({
  session: null as { user: { id: string; email: string; name: string; role?: string } } | null,
  add: vi.fn(),
  listByCandidate: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/server/auth/auth", () => ({ auth: { api: { getSession: async () => h.session } } }));
vi.mock("@/server/db/prisma", () => ({ prisma: {} }));
vi.mock("@/server/services/note.service", () => ({
  noteService: { add: h.add, listByCandidate: h.listByCandidate },
}));

import { POST, GET } from "./route";

function post(body: unknown) {
  return new Request("http://localhost/api/candidates/c1/notes", {
    method: "POST",
    body: JSON.stringify(body),
  });
}
const getReq = new Request("http://localhost/api/candidates/c1/notes");
const ctx = { params: Promise.resolve({ id: "c1" }) };

beforeEach(() => {
  h.session = { user: { id: "u1", email: "u@desta.works", name: "Test User", role: "Associate" } };
  h.add.mockReset();
  h.listByCandidate.mockReset();
});

describe("POST /api/candidates/:id/notes", () => {
  it("returns 401 when signed out and does not add", async () => {
    h.session = null;
    const res = await POST(post({ body: "hi", noteType: "internal" }), ctx);
    expect(res.status).toBe(401);
    expect(h.add).not.toHaveBeenCalled();
  });

  it("201 on add — forwards candidate id, input, and the session user", async () => {
    h.add.mockResolvedValue({
      id: "n1",
      body: "hi",
      noteType: "internal",
      authorId: "u1",
      authorName: "Test User",
      createdAt: "2026-07-04T00:00:00.000Z",
    });
    const res = await POST(post({ body: "hi", noteType: "external" }), ctx);
    expect(res.status).toBe(201);
    expect(h.add).toHaveBeenCalledWith(
      "c1",
      { body: "hi", noteType: "external" },
      expect.objectContaining({ id: "u1", name: "Test User" }),
    );
    expect((await res.json()).note.id).toBe("n1");
  });

  it("defaults noteType to internal when omitted", async () => {
    h.add.mockResolvedValue({ id: "n1" });
    const res = await POST(post({ body: "hi" }), ctx);
    expect(res.status).toBe(201);
    expect(h.add).toHaveBeenCalledWith(
      "c1",
      { body: "hi", noteType: "internal" },
      expect.anything(),
    );
  });

  it("422 on an empty body", async () => {
    const res = await POST(post({ body: "   " }), ctx);
    expect(res.status).toBe(422);
    expect(h.add).not.toHaveBeenCalled();
  });

  it("422 on an oversized body", async () => {
    const res = await POST(post({ body: "x".repeat(5001) }), ctx);
    expect(res.status).toBe(422);
    expect(h.add).not.toHaveBeenCalled();
  });

  it("422 on a bad noteType", async () => {
    const res = await POST(post({ body: "hi", noteType: "call" }), ctx);
    expect(res.status).toBe(422);
    expect(h.add).not.toHaveBeenCalled();
  });
});

describe("GET /api/candidates/:id/notes", () => {
  it("returns 401 when signed out", async () => {
    h.session = null;
    const res = await GET(getReq, ctx);
    expect(res.status).toBe(401);
    expect(h.listByCandidate).not.toHaveBeenCalled();
  });

  it("200 with the server-scoped notes list", async () => {
    h.listByCandidate.mockResolvedValue([{ id: "n1", noteType: "internal" }]);
    const res = await GET(getReq, ctx);
    expect(res.status).toBe(200);
    expect(h.listByCandidate).toHaveBeenCalledWith("c1", expect.objectContaining({ id: "u1" }));
    expect((await res.json()).notes).toHaveLength(1);
  });
});
