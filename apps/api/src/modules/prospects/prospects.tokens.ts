import { prospectService } from "@destaworks/application/prospect.service";
import { serviceToken } from "../service-token";

/**
 * The prospect area's injection token, kept out of `prospects.module.ts` so the module can import
 * its controller and the controller can name the token without an ES module cycle — `@Inject`
 * evaluates at class-definition time, so a cycle here is a boot-time ReferenceError, not a warning.
 */
export const PROSPECT_SERVICE = serviceToken<typeof prospectService>("PROSPECT_SERVICE");
