import { Module } from "@nestjs/common";
import { discoverService } from "@destaworks/application/discover.service";
import { savedIcpService } from "@destaworks/application/saved-icp.service";
import { provideService, serviceToken } from "../service-token";

export const DISCOVER_SERVICE = serviceToken<typeof discoverService>("DISCOVER_SERVICE");
export const SAVED_ICP_SERVICE = serviceToken<typeof savedIcpService>("SAVED_ICP_SERVICE");

/**
 * Client discovery: searching for prospective clients and the saved ICPs (ideal customer
 * profiles) that parameterise those searches.
 *
 * Wiring only until Phase 4.3 adds the controllers: the services are bound to tokens and exported,
 * so a controller injects one instead of importing the singleton and becoming untestable.
 */
@Module({
  providers: [
    provideService(DISCOVER_SERVICE, discoverService),
    provideService(SAVED_ICP_SERVICE, savedIcpService),
  ],
  exports: [DISCOVER_SERVICE, SAVED_ICP_SERVICE],
})
export class DiscoverModule {}
