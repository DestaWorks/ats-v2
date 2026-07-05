import { describe, it, expect, beforeEach, vi } from "vitest";
import { AppError } from "@/server/http/app-error";

/**
 * POST /api/candidates/:id/purge — the capability-gated permanent delete. Unauth → 401; a viewer
 * WITHOUT `purgeCandidate` (Associate) → 403 before any service work; an Owner (holds the
 * capability) → 200 `{ ok, id }`; a `CONFLICT` from the service (live candidate) → 409. The
 * capability check (`requireCapability`) runs for real against the session role; the service is mocked.
 */

const h = vi.hoisted(() => ({
  session: null as { user: { id: string; email: string; name: string; role?: string } } | null,
  purge: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/server/auth/auth", () => ({ auth: { api: { getSession: async () => h.session } } }));
vi.mock("@/server/db/prisma", () => ({ prisma: {} }));
vi.mock("@/server/services/candidate.service", () => ({
  candidateService: { purge: h.purge },
}));

import { POST } from "./route";

function req() {
  return new Request("http://localhost/api/candidates/c1/purge", { method: "POST" });
}
const ctx = { params: Promise.resolve({ id: "c1" }) };

beforeEach(() => {
  h.session = { user: { id: "o1", email: "o@desta.works", name: "O", role: "Owner" } };
  h.purge.mockReset();
});

describe("POST /api/candidates/:id/purge", () => {
  it("returns 401 when signed out and does not purge", async () => {
    h.session = null;
    const res = await POST(req(), ctx);
    expect(res.status).toBe(401);
    expect(h.purge).not.toHaveBeenCalled();
  });

  it("returns 403 for a viewer without purgeCandidate (Associate) — service untouched", async () => {
    h.session = { user: { id: "u1", email: "u@desta.works", name: "U", role: "Associate" } };
    const res = await POST(req(), ctx);
    expect(res.status).toBe(403);
    expect(h.purge).not.toHaveBeenCalled();
  });

  it("200 for an Owner — forwards id + user, returns { ok, id } (no PII)", async () => {
    h.purge.mockResolvedValue({ id: "c1" });
    const res = await POST(req(), ctx);
    expect(res.status).toBe(200);
    expect(h.purge).toHaveBeenCalledWith(
      "c1",
      expect.objectContaining({ id: "o1", role: "Owner" }),
    );
    expect(await res.json()).toEqual({ ok: true, id: "c1" });
  });

  it("maps a service CONFLICT (live candidate) to 409", async () => {
    h.purge.mockRejectedValue(new AppError("CONFLICT", "Only trashed candidates can be purged"));
    const res = await POST(req(), ctx);
    expect(res.status).toBe(409);
  });

  it("maps a service NOT_FOUND to 404", async () => {
    h.purge.mockRejectedValue(new AppError("NOT_FOUND", "Candidate not found"));
    const res = await POST(req(), ctx);
    expect(res.status).toBe(404);
  });
});
