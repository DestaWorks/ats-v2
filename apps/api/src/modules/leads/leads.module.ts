import { Module } from "@nestjs/common";
import { leadService } from "@destaworks/application/lead.service";
import { provideService, serviceToken } from "../service-token";

export const LEAD_SERVICE = serviceToken<typeof leadService>("LEAD_SERVICE");

/**
 * Source Leads — the pre-pipeline sourcing lifecycle (Sourced through Responded) that ends in a
 * promotion into the candidate pipeline.
 *
 * Wiring only until Phase 4.3 adds the controllers: the services are bound to tokens and exported,
 * so a controller injects one instead of importing the singleton and becoming untestable.
 */
@Module({
  providers: [provideService(LEAD_SERVICE, leadService)],
  exports: [LEAD_SERVICE],
})
export class LeadsModule {}
