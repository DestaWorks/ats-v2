import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * POST /api/migration/prepare — guarded route: unauth → 401; a non-bulkImport role → 403; a valid
 * request delegates to `migrationService.prepare` (the pipeline is covered by the service test) and
 * returns 200 with the report. Zero writes live in the service.
 */

const h = vi.hoisted(() => ({
  session: null as { user: { id: string; email: string; name: string; role?: string } } | null,
  prepare: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/server/auth/auth", () => ({ auth: { api: { getSession: async () => h.session } } }));
vi.mock("@/server/services/migration.service", () => ({
  migrationService: { prepare: h.prepare },
}));

import { POST } from "./route";

function req(body: unknown) {
  return new Request("http://localhost/api/migration/prepare", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

const body = { format: "csv", content: "ID,Name,Status\nL-1,Jane,0 - New Candidate\n" };

beforeEach(() => {
  h.session = { user: { id: "u1", email: "u@desta.works", name: "U", role: "Owner" } };
  h.prepare.mockReset();
});

describe("POST /api/migration/prepare", () => {
  it("401 when signed out (no service call)", async () => {
    h.session = null;
    const res = await POST(req(body), undefined);
    expect(res.status).toBe(401);
    expect(h.prepare).not.toHaveBeenCalled();
  });

  it("403 for a non-bulkImport role (Associate)", async () => {
    h.session = { user: { id: "u2", email: "a@desta.works", name: "A", role: "Associate" } };
    const res = await POST(req(body), undefined);
    expect(res.status).toBe(403);
    expect(h.prepare).not.toHaveBeenCalled();
  });

  it("422 for a missing content field (zod)", async () => {
    const res = await POST(req({ format: "csv" }), undefined);
    expect(res.status).toBe(422);
    expect(h.prepare).not.toHaveBeenCalled();
  });

  it("200 delegates to the service and returns the report", async () => {
    const report = { counts: { added: 1 }, rows: [], emailDuplicateGroups: [], checksum: "x" };
    h.prepare.mockResolvedValue(report);
    const res = await POST(req(body), undefined);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(report);
    const [, user] = h.prepare.mock.calls[0]!;
    expect(user).toMatchObject({ id: "u1", role: "Owner" });
  });
});
