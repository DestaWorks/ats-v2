import { Module } from "@nestjs/common";
import { prospectService } from "@destaworks/application/prospect.service";
import { provideService } from "../service-token";
import { ProspectsController } from "./prospects.controller";
import { PROSPECT_SERVICE } from "./prospects.tokens";

export { PROSPECT_SERVICE };

/**
 * Client Discovery prospects — the outbound side of the business: organisations we want as clients,
 * their contacts, and the enrichment that finds those contacts.
 *
 * The whole area is leadership-gated on `viewClientDiscovery`, declared once on the controller.
 */
@Module({
  controllers: [ProspectsController],
  providers: [provideService(PROSPECT_SERVICE, prospectService)],
  exports: [PROSPECT_SERVICE],
})
export class ProspectsModule {}
