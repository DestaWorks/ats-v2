import { Module } from "@nestjs/common";
import { leadService } from "@destaworks/application/lead.service";
import { CandidatesModule } from "../candidates/candidates.module";
import { provideService } from "../service-token";
import { LeadsController } from "./leads.controller";
import { LEAD_SERVICE } from "./leads.tokens";
import { SourcingController } from "./sourcing.controller";

export { LEAD_SERVICE };

/**
 * Source Leads — the pre-pipeline sourcing lifecycle (Sourced through Responded) that ends in a
 * promotion into the candidate pipeline.
 *
 * `SourcingController` sits here too: `/sourcing/similar` is a sourcing action even though the
 * similarity search behind it belongs to the candidates module, which is why that module is
 * imported rather than the service provided a second time.
 */
@Module({
  imports: [CandidatesModule],
  controllers: [LeadsController, SourcingController],
  providers: [provideService(LEAD_SERVICE, leadService)],
  exports: [LEAD_SERVICE],
})
export class LeadsModule {}
