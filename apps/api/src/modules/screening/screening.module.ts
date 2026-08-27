import { Module } from "@nestjs/common";
import { screeningService } from "@destaworks/application/screening.service";
import { provideService, serviceToken } from "../service-token";

export const SCREENING_SERVICE = serviceToken<typeof screeningService>("SCREENING_SERVICE");

/**
 * Screening calls and their outcomes — the first human gate in the pipeline.
 *
 * Wiring only until Phase 4.3 adds the controllers: the services are bound to tokens and exported,
 * so a controller injects one instead of importing the singleton and becoming untestable.
 */
@Module({
  providers: [provideService(SCREENING_SERVICE, screeningService)],
  exports: [SCREENING_SERVICE],
})
export class ScreeningModule {}
