import { Module } from "@nestjs/common";
import { healthService } from "@destaworks/application/health.service";
import { provideService, serviceToken } from "../service-token";
import { HealthController } from "./health.controller";

export const HEALTH_SERVICE = serviceToken<typeof healthService>("HEALTH_SERVICE");

/**
 * The one module that carries a controller in Phase 4.1 — the endpoint that proves the app boots,
 * routes and serves before a single business route is allowed to move. It is scaffolding with a
 * job, not a migrated route: `/api/health` and its readiness semantics cut over in Phase 4.3.
 */
@Module({
  controllers: [HealthController],
  providers: [provideService(HEALTH_SERVICE, healthService)],
  exports: [HEALTH_SERVICE],
})
export class HealthModule {}
