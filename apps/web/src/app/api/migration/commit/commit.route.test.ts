import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * POST /api/migration/commit — guarded route: unauth → 401; a non-bulkImport role → 403; a valid
 * request stages the run and answers 202 with its id. Phase 5: the route no longer runs the ETL,
 * so what it must prove is that it hands off and returns, never that it produced a report.
 */

const h = vi.hoisted(() => ({
  session: null as { user: { id: string; email: string; name: string; role?: string } } | null,
  start: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@destaworks/config/request-context", () => ({
  requestContext: () => ({ headers: async () => new Headers(), cookie: async () => undefined }),
}));
vi.mock("@destaworks/auth/auth", () => ({ auth: { api: { getSession: async () => h.session } } }));
vi.mock("@destaworks/db/memberships", async () => ({
  membershipReader: (
    await import("@destaworks/auth/testing/membership-double")
  ).singleTenantMembershipReader(() => h.session),
}));
vi.mock("@destaworks/application/migration-run.service", () => ({
  migrationRunService: { start: h.start },
}));

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
  h.start.mockReset();
});

describe("POST /api/migration/commit", () => {
  it("401 when signed out (nothing queued)", async () => {
    h.session = null;
    const res = await POST(req(body), undefined);
    expect(res.status).toBe(401);
    expect(h.start).not.toHaveBeenCalled();
  });

  it("403 for a non-bulkImport role (Screener)", async () => {
    h.session = { user: { id: "u3", email: "s@desta.works", name: "S", role: "Screener" } };
    const res = await POST(req(body), undefined);
    expect(res.status).toBe(403);
    expect(h.start).not.toHaveBeenCalled();
  });

  it("202 with the run id, having queued rather than imported", async () => {
    h.start.mockResolvedValue({ runId: "run-1", jobId: "job-1", status: "queued" });
    const res = await POST(req(body), undefined);
    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ runId: "run-1", jobId: "job-1", status: "queued" });
    const [user] = h.start.mock.calls[0]!;
    expect(user).toMatchObject({ user: { id: "u1" }, role: "Owner" });
  });
});
