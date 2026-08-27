import { Module } from "@nestjs/common";
import { briefService } from "@destaworks/application/brief.service";
import { provideService, serviceToken } from "../service-token";

export const BRIEF_SERVICE = serviceToken<typeof briefService>("BRIEF_SERVICE");

/**
 * Daily briefs and the recruiting targets they are measured against. One module because both
 * route areas (`/briefs`, `/targets`) are served by the same service today.
 *
 * Wiring only until Phase 4.3 adds the controllers: the services are bound to tokens and exported,
 * so a controller injects one instead of importing the singleton and becoming untestable.
 */
@Module({
  providers: [provideService(BRIEF_SERVICE, briefService)],
  exports: [BRIEF_SERVICE],
})
export class BriefsModule {}
