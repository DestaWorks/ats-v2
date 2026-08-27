import { Module } from "@nestjs/common";
import { prospectService } from "@destaworks/application/prospect.service";
import { provideService, serviceToken } from "../service-token";

export const PROSPECT_SERVICE = serviceToken<typeof prospectService>("PROSPECT_SERVICE");

/**
 * Prospective clients and their own lifecycle, ahead of becoming a client record.
 *
 * Wiring only until Phase 4.3 adds the controllers: the services are bound to tokens and exported,
 * so a controller injects one instead of importing the singleton and becoming untestable.
 */
@Module({
  providers: [provideService(PROSPECT_SERVICE, prospectService)],
  exports: [PROSPECT_SERVICE],
})
export class ProspectsModule {}
