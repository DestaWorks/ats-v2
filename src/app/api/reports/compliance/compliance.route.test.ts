import { describe, it, expect, beforeEach, vi } from "vitest";

/** GET /api/reports/compliance — gated `viewReports`. */

const h = vi.hoisted(() => ({
  session: null as { user: { id: string; email: string; name: string; role?: string } } | null,
  compliance: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/server/auth/auth", () => ({ auth: { api: { getSession: async () => h.session } } }));
vi.mock("@/server/services/reports/time-reports.service", () => ({
  timeReportsService: { compliance: h.compliance },
}));

import { GET } from "./route";

const getReq = () => new Request("http://localhost/api/reports/compliance");

beforeEach(() => {
  h.session = null;
  h.compliance.mockReset();
});

describe("GET /api/reports/compliance", () => {
  it("401 when signed out", async () => {
    const res = await GET(getReq(), undefined);
    expect(res.status).toBe(401);
    expect(h.compliance).not.toHaveBeenCalled();
  });

  it("403 for a non-leadership role", async () => {
    h.session = { user: { id: "u1", email: "a@desta.works", name: "A", role: "Associate" } };
    const res = await GET(getReq(), undefined);
    expect(res.status).toBe(403);
    expect(h.compliance).not.toHaveBeenCalled();
  });

  it("200 for Owner, delegates to the service", async () => {
    h.session = { user: { id: "u1", email: "o@desta.works", name: "O", role: "Owner" } };
    const result = { byLicenseStatus: [], requiringAction: [] };
    h.compliance.mockResolvedValue(result);
    const res = await GET(getReq(), undefined);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(result);
  });
});
