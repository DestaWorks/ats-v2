import { Module } from "@nestjs/common";
import { templatePerformanceService } from "@destaworks/application/template-performance.service";
import { provideService } from "../service-token";
import { TEMPLATE_PERFORMANCE_SERVICE } from "./templates.tokens";
import { TemplatesController } from "./templates.controller";

export { TEMPLATE_PERFORMANCE_SERVICE } from "./templates.tokens";

/**
 * Outreach templates and how each one is actually performing.
 *
 * Wiring only until Phase 4.3 adds the controllers: the services are bound to tokens and exported,
 * so a controller injects one instead of importing the singleton and becoming untestable.
 */
@Module({
  controllers: [TemplatesController],
  providers: [provideService(TEMPLATE_PERFORMANCE_SERVICE, templatePerformanceService)],
  exports: [TEMPLATE_PERFORMANCE_SERVICE],
})
export class TemplatesModule {}
