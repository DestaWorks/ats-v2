import { leadService } from "@destaworks/application/lead.service";
import { serviceToken } from "../service-token";

/**
 * The lead area's injection token, in its own file rather than in `leads.module.ts`.
 *
 * The module has to import its controllers to register them, and a controller has to name this
 * token in `@Inject(...)`. Putting both in one file makes an ES module cycle whose failure is not
 * subtle: `@Inject` evaluates when the controller class is DEFINED, so the token would still be in
 * its temporal dead zone and the app would die at import time with "Cannot access 'LEAD_SERVICE'
 * before initialization". A leaf file both sides import has no cycle to break.
 */
export const LEAD_SERVICE = serviceToken<typeof leadService>("LEAD_SERVICE");
