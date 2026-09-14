import { Module } from "@nestjs/common";
import { screeningService } from "@destaworks/application/screening.service";
import { provideService } from "../service-token";
import { SCREENING_SERVICE } from "./screening.tokens";
import { ScreeningController } from "./screening.controller";

export { SCREENING_SERVICE } from "./screening.tokens";

/**
 * Screening calls and their outcomes — the first human gate in the pipeline.
 *
 * Wiring only until Phase 4.3 adds the controllers: the services are bound to tokens and exported,
 * so a controller injects one instead of importing the singleton and becoming untestable.
 */
@Module({
  controllers: [ScreeningController],
  providers: [provideService(SCREENING_SERVICE, screeningService)],
  exports: [SCREENING_SERVICE],
})
export class ScreeningModule {}
