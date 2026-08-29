import { Module } from "@nestjs/common";
import { lookupService } from "@destaworks/application/lookup.service";
import { provideService } from "../service-token";
import { LOOKUP_SERVICE } from "./lookups.tokens";
import { LookupsController } from "./lookups.controller";

export { LOOKUP_SERVICE } from "./lookups.tokens";

/** Filter-dropdown options — the one read shared by nearly every list page. */
@Module({
  controllers: [LookupsController],
  providers: [provideService(LOOKUP_SERVICE, lookupService)],
  exports: [LOOKUP_SERVICE],
})
export class LookupsModule {}
