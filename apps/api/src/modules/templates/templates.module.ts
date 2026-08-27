import { Module } from "@nestjs/common";
import { templatePerformanceService } from "@destaworks/application/template-performance.service";
import { provideService, serviceToken } from "../service-token";

export const TEMPLATE_PERFORMANCE_SERVICE = serviceToken<typeof templatePerformanceService>(
  "TEMPLATE_PERFORMANCE_SERVICE",
);

/**
 * Outreach templates and how each one is actually performing.
 *
 * Wiring only until Phase 4.3 adds the controllers: the services are bound to tokens and exported,
 * so a controller injects one instead of importing the singleton and becoming untestable.
 */
@Module({
  providers: [provideService(TEMPLATE_PERFORMANCE_SERVICE, templatePerformanceService)],
  exports: [TEMPLATE_PERFORMANCE_SERVICE],
})
export class TemplatesModule {}
