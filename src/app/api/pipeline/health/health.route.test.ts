import { describe, it, expect, beforeEach, vi } from "vitest";

/** POST /api/pipeline/health — guarded: unauth → 401 (no service call, no rate-limit consumed). */

const h = vi.hoisted(() => ({
  session: null as { user: { id: string; email: string; name: string; role?: string } } | null,
  generate: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/server/auth/request-context", () => ({
  requestContext: () => ({ headers: async () => new Headers() }),
}));
vi.mock("@/server/auth/auth", () => ({ auth: { api: { getSession: async () => h.session } } }));
vi.mock("@/server/services/pipeline-health.service", () => ({
  pipelineHealthService: { generate: h.generate },
}));

import { POST } from "./route";

const req = () => new Request("http://localhost/api/pipeline/health", { method: "POST" });

beforeEach(() => {
  h.session = { user: { id: "u1", email: "u@desta.works", name: "U", role: "Associate" } };
  h.generate.mockReset();
});

describe("POST /api/pipeline/health", () => {
  it("401 when signed out (no service call)", async () => {
    h.session = null;
    const res = await POST(req(), undefined);
    expect(res.status).toBe(401);
    expect(h.generate).not.toHaveBeenCalled();
  });

  it("200 delegates to the service and returns the health DTO", async () => {
    const health = { diagnostic: "d", healthScore: 80, topAction: "a" };
    h.generate.mockResolvedValue(health);
    const res = await POST(req(), undefined);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(health);
    expect(h.generate).toHaveBeenCalled();
  });
});
