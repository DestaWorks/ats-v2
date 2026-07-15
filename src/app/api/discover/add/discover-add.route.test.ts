import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * POST /api/discover/add — the guarded bulk-add: unauth → 401 (nothing added); a valid body → 200
 * with `{added, skipped}`; missing `rows` → 422 (zod); a bad NPI format → 422; an unknown key →
 * 422 (strict). `discoverService` is mocked (unit-tested separately); auth + zod run for real.
 */

const h = vi.hoisted(() => ({
  session: null as { user: { id: string; email: string; name: string; role?: string } } | null,
  addToSourcing: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/server/auth/auth", () => ({ auth: { api: { getSession: async () => h.session } } }));
vi.mock("@/server/db/prisma", () => ({ prisma: {} }));
vi.mock("@/server/services/discover.service", () => ({
  discoverService: { addToSourcing: h.addToSourcing },
}));

import { POST } from "./route";

const goodRow = { npi: "1234567890", name: "Jane Doe" };

function postReq(body: unknown) {
  return new Request("http://localhost/api/discover/add", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  h.session = { user: { id: "u1", email: "u@desta.works", name: "U", role: "Associate" } };
  h.addToSourcing.mockReset();
});

describe("POST /api/discover/add", () => {
  it("returns 401 when signed out and does not add", async () => {
    h.session = null;
    const res = await POST(postReq({ rows: [goodRow] }), undefined);
    expect(res.status).toBe(401);
    expect(h.addToSourcing).not.toHaveBeenCalled();
  });

  it("200 happy path — forwards the validated input and returns the summary", async () => {
    h.addToSourcing.mockResolvedValue({ added: 1, skipped: 0 });
    const res = await POST(postReq({ rows: [goodRow], clientId: "cl1" }), undefined);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ added: 1, skipped: 0 });
    expect(h.addToSourcing).toHaveBeenCalledWith(
      { rows: [goodRow], clientId: "cl1" },
      expect.objectContaining({ id: "u1" }),
    );
  });

  it("422s a body with no rows", async () => {
    const res = await POST(postReq({ rows: [] }), undefined);
    expect(res.status).toBe(422);
    expect(h.addToSourcing).not.toHaveBeenCalled();
  });

  it("422s a row with a malformed NPI", async () => {
    const res = await POST(postReq({ rows: [{ npi: "not-an-npi", name: "Jane Doe" }] }), undefined);
    expect(res.status).toBe(422);
    expect(h.addToSourcing).not.toHaveBeenCalled();
  });

  it("422s an unknown top-level key (strict)", async () => {
    const res = await POST(postReq({ rows: [goodRow], bogus: true }), undefined);
    expect(res.status).toBe(422);
    expect(h.addToSourcing).not.toHaveBeenCalled();
  });
});
