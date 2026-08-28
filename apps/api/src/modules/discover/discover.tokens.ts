import { discoverService } from "@destaworks/application/discover.service";
import { savedIcpService } from "@destaworks/application/saved-icp.service";
import { serviceToken } from "../service-token";

/** @see ../saved-views/saved-views.tokens — why tokens live outside the module file. */
export const DISCOVER_SERVICE = serviceToken<typeof discoverService>("DISCOVER_SERVICE");
export const SAVED_ICP_SERVICE = serviceToken<typeof savedIcpService>("SAVED_ICP_SERVICE");
