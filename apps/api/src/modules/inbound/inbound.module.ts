import { Module } from "@nestjs/common";
import { inboundService } from "@destaworks/application/inbound.service";
import { provideService } from "../service-token";
import { InboundController } from "./inbound.controller";
import { INBOUND_SERVICE } from "./inbound.tokens";

export { INBOUND_SERVICE };

/**
 * Inbound Triage — a pasted reply is extracted, deduped and client-matched, then either attached to
 * the lead it belongs to or saved as a new one.
 */
@Module({
  controllers: [InboundController],
  providers: [provideService(INBOUND_SERVICE, inboundService)],
  exports: [INBOUND_SERVICE],
})
export class InboundModule {}
