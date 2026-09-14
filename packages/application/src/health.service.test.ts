import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * Proves `healthService.check` reports a clean ok/not-ok result — a down database is an EXPECTED
 * condition to report, never a thrown error the caller has to catch. `healthRepository` is
 * mocked; nothing here touches a real DB.
 */

const h = vi.hoisted(() => ({ pingDatabase: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@destaworks/db/repositories/health.repository", () => ({
  healthRepository: { pingDatabase: h.pingDatabase },
}));

import { healthService } from "./health.service";

beforeEach(() => {
  h.pingDatabase.mockReset();
});

describe("healthService.check", () => {
  it("reports ok when the database ping succeeds", async () => {
    h.pingDatabase.mockResolvedValue(undefined);
    const result = await healthService.check();
    expect(result).toEqual({ ok: true, checks: { database: true } });
  });

  it("reports not-ok (never throws) when the database ping fails", async () => {
    h.pingDatabase.mockRejectedValue(new Error("connection refused"));
    const result = await healthService.check();
    expect(result).toEqual({ ok: false, checks: { database: false } });
  });
});
