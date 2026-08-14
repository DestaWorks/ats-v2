import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * GET /api/health — public (no auth guard at all — an uptime monitor can't sign in): 200 + ok
 * when the DB check passes, 503 + not-ok when it fails. `healthService` is mocked.
 */

const h = vi.hoisted(() => ({ check: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/server/services/health.service", () => ({ healthService: { check: h.check } }));

import { GET } from "./route";

beforeEach(() => {
  h.check.mockReset();
});

describe("GET /api/health", () => {
  it("200 with ok:true when the service reports healthy", async () => {
    h.check.mockResolvedValue({ ok: true, checks: { database: true } });
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, checks: { database: true } });
  });

  it("503 with ok:false when the service reports unhealthy — never a 500", async () => {
    h.check.mockResolvedValue({ ok: false, checks: { database: false } });
    const res = await GET();
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ ok: false, checks: { database: false } });
  });
});
