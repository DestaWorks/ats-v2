import { describe, it, expect, beforeEach, vi } from "vitest";

/** GET /api/reports/executive — gated `viewReports` (leadership only). */

const h = vi.hoisted(() => ({
  session: null as { user: { id: string; email: string; name: string; role?: string } } | null,
  executiveSummary: vi.fn(),
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
vi.mock("@destaworks/application/reports/pipeline-reports.service", () => ({
  pipelineReportsService: { executiveSummary: h.executiveSummary },
}));

import { GET } from "./route";

const getReq = () => new Request("http://localhost/api/reports/executive");

beforeEach(() => {
  h.session = null;
  h.executiveSummary.mockReset();
});

describe("GET /api/reports/executive", () => {
  it("401 when signed out", async () => {
    const res = await GET(getReq(), undefined);
    expect(res.status).toBe(401);
    expect(h.executiveSummary).not.toHaveBeenCalled();
  });

  it("403 for a non-leadership role (Associate has no viewReports)", async () => {
    h.session = { user: { id: "u1", email: "a@desta.works", name: "A", role: "Associate" } };
    const res = await GET(getReq(), undefined);
    expect(res.status).toBe(403);
    expect(h.executiveSummary).not.toHaveBeenCalled();
  });

  it("200 for Owner, delegates to the service", async () => {
    h.session = { user: { id: "u1", email: "o@desta.works", name: "O", role: "Owner" } };
    const result = { total: 1 };
    h.executiveSummary.mockResolvedValue(result);
    const res = await GET(getReq(), undefined);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(result);
  });
});
