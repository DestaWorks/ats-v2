import { describe, it, expect, beforeEach, vi } from "vitest";

const h = vi.hoisted(() => ({
  session: null as { user: { id: string; email: string; name: string; role?: string } } | null,
  getUsageOverview: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/server/auth/auth", () => ({ auth: { api: { getSession: async () => h.session } } }));
vi.mock("@/server/db/prisma", () => ({ prisma: {} }));
vi.mock("@/server/services/ai-ops.service", () => ({
  aiOpsService: { getUsageOverview: h.getUsageOverview },
}));

import { GET } from "./route";

beforeEach(() => {
  h.session = null;
  h.getUsageOverview.mockReset();
});

describe("GET /api/admin/ai/usage", () => {
  it("401 when signed out", async () => {
    const res = await GET(new Request("http://localhost/api/admin/ai/usage"), undefined);
    expect(res.status).toBe(401);
    expect(h.getUsageOverview).not.toHaveBeenCalled();
  });

  it("403 for a non-manageAiSettings role (Manager)", async () => {
    h.session = { user: { id: "u1", email: "m@desta.works", name: "M", role: "Manager" } };
    const res = await GET(new Request("http://localhost/api/admin/ai/usage"), undefined);
    expect(res.status).toBe(403);
  });

  it("200 for Admin — returns the overview", async () => {
    h.session = { user: { id: "u1", email: "a@desta.works", name: "A", role: "Admin" } };
    const overview = {
      windowHours: 24,
      totalCalls: 0,
      successCount: 0,
      errorCount: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      avgLatencyMs: 0,
      recent: [],
    };
    h.getUsageOverview.mockResolvedValue(overview);
    const res = await GET(new Request("http://localhost/api/admin/ai/usage"), undefined);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(overview);
  });
});
