import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * GET /api/migration/runs/:runId — the status read behind the same `bulkImport` gate as the
 * commit that creates a run, because the run's report names the candidates it imported.
 */

const h = vi.hoisted(() => ({
  session: null as { user: { id: string; email: string; name: string; role?: string } } | null,
  state: vi.fn(),
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
  migrationRunService: { state: h.state },
}));

import { GET } from "./route";

const ctx = { params: Promise.resolve({ runId: "run-1" }) };
const req = () => new Request("http://localhost/api/migration/runs/run-1");

beforeEach(() => {
  h.session = { user: { id: "u1", email: "u@desta.works", name: "U", role: "Owner" } };
  h.state.mockReset();
});

describe("GET /api/migration/runs/:runId", () => {
  it("401 when signed out", async () => {
    h.session = null;
    const res = await GET(req(), ctx);
    expect(res.status).toBe(401);
    expect(h.state).not.toHaveBeenCalled();
  });

  it("403 for a role without bulkImport", async () => {
    h.session = { user: { id: "u3", email: "s@desta.works", name: "S", role: "Screener" } };
    const res = await GET(req(), ctx);
    expect(res.status).toBe(403);
    expect(h.state).not.toHaveBeenCalled();
  });

  it("200 with the run's progress while it is still going", async () => {
    h.state.mockResolvedValue({
      runId: "run-1",
      jobId: "job-1",
      status: "running",
      attempt: 1,
      processedRows: 120,
      totalRows: 900,
      report: null,
    });
    const res = await GET(req(), ctx);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: "running", processedRows: 120 });
    expect(h.state).toHaveBeenCalledWith(
      expect.objectContaining({ user: expect.objectContaining({ id: "u1" }) }),
      "run-1",
    );
  });

  it("404 for a run id that does not exist", async () => {
    const { AppError } = await import("@destaworks/integrations/http/app-error");
    h.state.mockRejectedValue(new AppError("NOT_FOUND", "Import run not found"));
    const res = await GET(req(), ctx);
    expect(res.status).toBe(404);
  });
});
