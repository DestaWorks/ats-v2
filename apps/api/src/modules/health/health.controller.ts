import { Controller, Get } from "@nestjs/common";

export interface LivenessResponse {
  readonly status: "ok";
}

/**
 * Liveness: is this process up and routing? It is what an orchestrator restarts on, so it
 * deliberately touches nothing — no database, no session, no capability check. A probe that
 * depends on a downstream service reports that service's outage as "this process is dead", and
 * gets a healthy process killed during an incident it was not part of.
 *
 * READINESS — "is the database reachable?" — is a different question with a different answer, and
 * it already has a service (`healthService.check()`, wired in this module). It is exposed when
 * `/api/health` migrates in Phase 4.3.
 */
@Controller("health")
export class HealthController {
  @Get()
  live(): LivenessResponse {
    return { status: "ok" };
  }
}
