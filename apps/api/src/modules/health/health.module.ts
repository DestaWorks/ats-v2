import { Module } from "@nestjs/common";
import { healthService } from "@destaworks/application/health.service";
import { provideService } from "../service-token";
import { HealthController } from "./health.controller";
import { HEALTH_SERVICE } from "./health.tokens";

export { HEALTH_SERVICE };

/**
 * Liveness and readiness. `GET /health` is the Phase 4.3 port of `/api/health` — the readiness
 * probe an uptime monitor pings, which reports the database's reachability as 200 or 503.
 * `GET /health/live` is the process-only liveness check that proved the app boots and routes in
 * Phase 4.1, kept because it answers a different question with different consequences.
 */
@Module({
  controllers: [HealthController],
  providers: [provideService(HEALTH_SERVICE, healthService)],
  exports: [HEALTH_SERVICE],
})
export class HealthModule {}
