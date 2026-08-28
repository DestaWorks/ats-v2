import { Controller, Get, Inject, Res } from "@nestjs/common";
import type { HealthCheckResult } from "@destaworks/application/health.service";
import type { HttpResponseLike } from "../../common/http";
import type { ServiceOf } from "../service-token";
import { HEALTH_SERVICE } from "./health.tokens";

export interface LivenessResponse {
  readonly status: "ok";
}

/** Response body of `GET /health` — deliberately not the usual error envelope. */
export type GetHealthResponse = HealthCheckResult;

/**
 * The two health questions, kept apart because they have different answers and different
 * consequences.
 *
 * `GET /health` is READINESS — the port of `/api/health`, which is what an uptime monitor pings.
 * It actually proves Postgres is reachable, answers 200 or 503, and returns a minimal body that is
 * deliberately NOT this app's `{error:{code,message}}` envelope: a monitoring tool should see
 * "up or down" and nothing else — no stack trace, no connection string, no PII surface at all. It
 * is public and unauthenticated, because an uptime monitor cannot sign in.
 *
 * `GET /health/live` is LIVENESS — is this process up and routing? It is what an orchestrator
 * restarts on, so it touches nothing: no database, no session, no capability check. A probe that
 * depends on a downstream service reports that service's outage as "this process is dead", and
 * gets a healthy process killed during an incident it was not part of.
 */
@Controller("health")
export class HealthController {
  constructor(@Inject(HEALTH_SERVICE) private readonly health: ServiceOf<typeof HEALTH_SERVICE>) {}

  /**
   * `@Res()` without passthrough because the STATUS is the payload here: a reachable database is
   * 200 and an unreachable one is 503, and Nest's per-route status is a constant.
   */
  @Get()
  async ready(@Res() response: HttpResponseLike): Promise<void> {
    const result: GetHealthResponse = await this.health.check();
    response.status(result.ok ? 200 : 503);
    response.json(result);
  }

  @Get("live")
  live(): LivenessResponse {
    return { status: "ok" };
  }
}
