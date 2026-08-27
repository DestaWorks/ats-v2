import { describe, it, expect, beforeEach, vi } from "vitest";

/** GET /api/reports/export — gated `viewReports`; returns a real CSV, not JSON. */

const h = vi.hoisted(() => ({
  session: null as { user: { id: string; email: string; name: string; role?: string } } | null,
  candidatesCsv: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@destaworks/config/request-context", () => ({
  requestContext: () => ({ headers: async () => new Headers() }),
}));
vi.mock("@destaworks/auth/auth", () => ({ auth: { api: { getSession: async () => h.session } } }));
vi.mock("@destaworks/application/reports/export.service", () => ({
  exportService: { candidatesCsv: h.candidatesCsv },
}));

import { GET } from "./route";

const getReq = () => new Request("http://localhost/api/reports/export");

beforeEach(() => {
  h.session = null;
  h.candidatesCsv.mockReset();
});

describe("GET /api/reports/export", () => {
  it("401 when signed out", async () => {
    const res = await GET(getReq(), undefined);
    expect(res.status).toBe(401);
    expect(h.candidatesCsv).not.toHaveBeenCalled();
  });

  it("403 for a non-leadership role", async () => {
    h.session = { user: { id: "u1", email: "a@desta.works", name: "A", role: "Associate" } };
    const res = await GET(getReq(), undefined);
    expect(res.status).toBe(403);
    expect(h.candidatesCsv).not.toHaveBeenCalled();
  });

  it("200 for Owner — real CSV body + download headers", async () => {
    h.session = { user: { id: "u1", email: "o@desta.works", name: "O", role: "Owner" } };
    h.candidatesCsv.mockResolvedValue("Name\r\nJane Doe");
    const res = await GET(getReq(), undefined);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/csv; charset=utf-8");
    expect(res.headers.get("Content-Disposition")).toContain("attachment");
    expect(await res.text()).toBe("Name\r\nJane Doe");
  });
});
