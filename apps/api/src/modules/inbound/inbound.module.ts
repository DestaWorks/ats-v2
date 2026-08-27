import { Module } from "@nestjs/common";
import { inboundService } from "@destaworks/application/inbound.service";
import { provideService, serviceToken } from "../service-token";

export const INBOUND_SERVICE = serviceToken<typeof inboundService>("INBOUND_SERVICE");

/**
 * Inbound applications arriving from outside the operator app.
 *
 * Wiring only until Phase 4.3 adds the controllers: the services are bound to tokens and exported,
 * so a controller injects one instead of importing the singleton and becoming untestable.
 */
@Module({
  providers: [provideService(INBOUND_SERVICE, inboundService)],
  exports: [INBOUND_SERVICE],
})
export class InboundModule {}
