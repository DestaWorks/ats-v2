import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";

/**
 * Contract test for `TemplatesController` (SAAS-RESTRUCTURE-PLAN 4.3).
 *
 * Template performance is an aggregate analytics read, gated on `viewAnalytics`. The gate is what
 * this pins: an operator is refused, a leader is served, and the refusal happens before the
 * aggregate runs.
 */

const h = vi.hoisted(() => ({
  session: null as { user: { id: string; email: string; name: string; role?: string } } | null,
  templates: { overview: vi.fn() },
}));

vi.mock("server-only", () => ({}));
vi.mock("@destaworks/auth/auth", () => ({ auth: { api: { getSession: async () => h.session } } }));
vi.mock("@destaworks/db/prisma", () => ({ prisma: {} }));
vi.mock("@destaworks/application/template-performance.service", () => ({
  templatePerformanceService: h.templates,
}));

import {
  startContractHost,
  type ContractHost,
  type ErrorEnvelope,
} from "../../common/testing/contract-host";
import { TemplatesModule } from "./templates.module";

const PERFORMANCE = { templates: [], totals: { sent: 0, responded: 0 } };

let api: ContractHost;

function signInAs(role: string): void {
  h.session = { user: { id: "u1", email: "u@desta.works", name: "Test User", role } };
}

beforeAll(async () => {
  api = await startContractHost(TemplatesModule);
});

afterAll(async () => {
  await api.close();
});

beforeEach(() => {
  vi.clearAllMocks();
  h.templates.overview.mockResolvedValue(PERFORMANCE);
});

describe("GET /templates/performance", () => {
  it("refuses an authenticated viewer without viewAnalytics with 403, computing nothing", async () => {
    signInAs("Associate");
    const res = await api.request("/templates/performance");
    expect(res.status).toBe(403);
    expect(((await res.json()) as ErrorEnvelope).error.code).toBe("FORBIDDEN");
    expect(h.templates.overview).not.toHaveBeenCalled();
  });

  it("refuses a signed-out caller with 401", async () => {
    h.session = null;
    const res = await api.request("/templates/performance");
    expect(res.status).toBe(401);
    expect(h.templates.overview).not.toHaveBeenCalled();
  });

  it("answers 200 with the per-template figures for a leader", async () => {
    signInAs("Owner");
    const res = await api.request("/templates/performance");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(PERFORMANCE);
  });
});
