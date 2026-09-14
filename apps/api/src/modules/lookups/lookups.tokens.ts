import { lookupService } from "@destaworks/application/lookup.service";
import { serviceToken } from "../service-token";

/** Declared apart from the module that binds it — see `candidates.tokens.ts` for why. */
export const LOOKUP_SERVICE = serviceToken<typeof lookupService>("LOOKUP_SERVICE");
