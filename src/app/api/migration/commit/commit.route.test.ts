import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * POST /api/migration/commit — guarded route: unauth → 401; a non-bulkImport role → 403; a valid
 * request delegates to `migrationService.commit` (idempotent upsert + audit live in the service).
 */

const h = vi.hoisted(() => ({
  session: null as { user: { id: string; email: string; name: string; role?: string } } | null,
  commit: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/server/auth/auth", () => ({ auth: { api: { getSession: async () => h.session } } }));
vi.mock("@/server/services/migration.service", () => ({ migrationService: { commit: h.commit } }));

import { POST } from "./route";

function req(body: unknown) {
  return new Request("http://localhost/api/migration/commit", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

const body = { format: "csv", content: "ID,Name,Status\nL-1,Jane,0 - New Candidate\n" };

beforeEach(() => {
  h.session = { user: { id: "u1", email: "u@desta.works", name: "U", role: "Owner" } };
  h.commit.mockReset();
});

describe("POST /api/migration/commit", () => {
  it("401 when signed out (no service call)", async () => {
    h.session = null;
    const res = await POST(req(body), undefined);
    expect(res.status).toBe(401);
    expect(h.commit).not.toHaveBeenCalled();
  });

  it("403 for a non-bulkImport role (Screener)", async () => {
    h.session = { user: { id: "u3", email: "s@desta.works", name: "S", role: "Screener" } };
    const res = await POST(req(body), undefined);
    expect(res.status).toBe(403);
    expect(h.commit).not.toHaveBeenCalled();
  });

  it("200 delegates to the service and returns the realized report", async () => {
    const report = { counts: { updated: 1 }, rows: [], emailDuplicateGroups: [], checksum: "x" };
    h.commit.mockResolvedValue(report);
    const res = await POST(req(body), undefined);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(report);
    const [, user] = h.commit.mock.calls[0]!;
    expect(user).toMatchObject({ id: "u1", role: "Owner" });
  });
});
