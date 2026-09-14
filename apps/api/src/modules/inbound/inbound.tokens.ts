import { inboundService } from "@destaworks/application/inbound.service";
import { serviceToken } from "../service-token";

/**
 * The inbound-triage injection token, kept out of `inbound.module.ts` so the module can import its
 * controller and the controller can name the token without an ES module cycle — `@Inject` evaluates
 * at class-definition time, so a cycle here is a boot-time ReferenceError, not a warning.
 */
export const INBOUND_SERVICE = serviceToken<typeof inboundService>("INBOUND_SERVICE");
