import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * POST /api/leads — the guarded add-lead: unauth → 401 (nothing created); a valid body → 201 with
 * the created lead detail; missing `name` → 422 (zod); a `status` key → 422 (strict, can't seed a
 * stage). `leadService` is mocked (unit-tested separately); auth + zod run for real off the session.
 */

const h = vi.hoisted(() => ({
  session: null as { user: { id: string; email: string; name: string; role?: string } } | null,
  create: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/server/auth/auth", () => ({ auth: { api: { getSession: async () => h.session } } }));
vi.mock("@/server/db/prisma", () => ({ prisma: {} }));
vi.mock("@/server/services/lead.service", () => ({ leadService: { create: h.create } }));

import { POST } from "./route";

function postReq(body: unknown) {
  return new Request("http://localhost/api/leads", { method: "POST", body: JSON.stringify(body) });
}

beforeEach(() => {
  h.session = { user: { id: "u1", email: "u@desta.works", name: "U", role: "Associate" } };
  h.create.mockReset();
});

describe("POST /api/leads", () => {
  it("returns 401 when signed out and does not create", async () => {
    h.session = null;
    const res = await POST(postReq({ name: "Jane" }), undefined);
    expect(res.status).toBe(401);
    expect(h.create).not.toHaveBeenCalled();
  });

  it("201 happy path — forwards the validated input and returns the lead", async () => {
    h.create.mockResolvedValue({ id: "l1", name: "Jane" });
    const res = await POST(postReq({ name: "Jane", source: "LinkedIn" }), undefined);
    expect(res.status).toBe(201);
    expect(h.create).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Jane", source: "LinkedIn" }),
      expect.objectContaining({ id: "u1" }),
    );
    expect((await res.json()).lead.id).toBe("l1");
  });

  it("422 when name is missing (required)", async () => {
    const res = await POST(postReq({ email: "j@x.com" }), undefined);
    expect(res.status).toBe(422);
    expect(h.create).not.toHaveBeenCalled();
  });

  it("422 when the body carries an unknown key (strict)", async () => {
    const res = await POST(postReq({ name: "Jane", status: "Outreach 1" }), undefined);
    expect(res.status).toBe(422);
    expect(h.create).not.toHaveBeenCalled();
  });
});
