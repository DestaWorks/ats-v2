import { describe, it, expect, vi } from "vitest";

/**
 * Contract parity for `GET /health` against the Next.js route it replaces
 * (`apps/web/src/app/api/health/route.ts`), plus the liveness probe beside it.
 *
 * The route's contract is unusual and easy to lose in a port: the STATUS carries the answer
 * (200 up, 503 down), and the body is deliberately NOT this app's error envelope — a monitoring
 * tool must see "up or down" and nothing else. Both halves are asserted here.
 */

vi.mock("server-only", () => ({}));

import { HEALTH_SERVICE } from "./health.tokens";
import { HealthController } from "./health.controller";
import { RecordingResponse } from "../../common/testing/nest-host";
import { injectedTokens, routeOf } from "../../common/testing/route-parity";

/** The two states the readiness probe reports, as `healthService.check()` returns them. */
const UP = { ok: true, checks: { database: true } };
const DOWN = { ok: false, checks: { database: false } };

function controllerReturning(result: typeof UP): HealthController {
  return new HealthController({ check: async () => result });
}

describe("GET /health — readiness, ported from GET /api/health", () => {
  it("is mounted at the Next.js route's own verb and path, with no /api prefix", () => {
    expect(routeOf(HealthController, "ready")).toMatchObject({ method: "GET", path: "/health" });
  });

  it("is public: the Next.js route has no guard, and neither may this one", () => {
    expect(routeOf(HealthController, "ready").guards).toEqual([]);
    expect(routeOf(HealthController, "ready").capability).toBeUndefined();
  });

  it("injects the health service by token — never the imported singleton", () => {
    expect(injectedTokens(HealthController)).toEqual([HEALTH_SERVICE]);
  });

  it("answers 200 + the check result when the database is reachable", async () => {
    const response = new RecordingResponse();
    await controllerReturning(UP).ready(response);
    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual(UP);
  });

  it("answers 503 + the same body shape when the database is not — never an error envelope", async () => {
    const response = new RecordingResponse();
    await controllerReturning(DOWN).ready(response);
    expect(response.statusCode).toBe(503);
    expect(response.body).toEqual(DOWN);
    expect(JSON.stringify(response.body)).not.toContain("error");
  });
});

describe("GET /health/live — liveness", () => {
  it("is mounted beside readiness and touches nothing", () => {
    expect(routeOf(HealthController, "live")).toMatchObject({
      method: "GET",
      path: "/health/live",
      guards: [],
    });
    const health = { check: vi.fn() };
    expect(new HealthController(health).live()).toEqual({ status: "ok" });
    expect(health.check).not.toHaveBeenCalled();
  });
});
