import { Module } from "@nestjs/common";
import { briefService } from "@destaworks/application/brief.service";
import { provideService } from "../service-token";
import { BriefsController } from "./briefs.controller";
import { BRIEF_SERVICE } from "./briefs.tokens";
import { TargetsController } from "./targets.controller";

/**
 * Daily briefs and the recruiting targets they are measured against. One module because both
 * route areas (`/briefs`, `/targets`) are served by the same service today.
 *
 * The service is bound to a token (`briefs.tokens.ts`) rather than imported by the controllers,
 * so each injects it instead of reaching for the singleton and becoming untestable.
 */
@Module({
  controllers: [BriefsController, TargetsController],
  providers: [provideService(BRIEF_SERVICE, briefService)],
  exports: [BRIEF_SERVICE],
})
export class BriefsModule {}
