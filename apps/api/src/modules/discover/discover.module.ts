import { Module } from "@nestjs/common";
import { discoverService } from "@destaworks/application/discover.service";
import { savedIcpService } from "@destaworks/application/saved-icp.service";
import { provideService } from "../service-token";
import { DiscoverController } from "./discover.controller";
import { SavedIcpsController } from "./saved-icps.controller";
import { DISCOVER_SERVICE, SAVED_ICP_SERVICE } from "./discover.tokens";

export { DISCOVER_SERVICE, SAVED_ICP_SERVICE } from "./discover.tokens";

/**
 * Client discovery: searching for prospective clients and the saved ICPs (ideal customer
 * profiles) that parameterise those searches.
 */
@Module({
  controllers: [DiscoverController, SavedIcpsController],
  providers: [
    provideService(DISCOVER_SERVICE, discoverService),
    provideService(SAVED_ICP_SERVICE, savedIcpService),
  ],
  exports: [DISCOVER_SERVICE, SAVED_ICP_SERVICE],
})
export class DiscoverModule {}
