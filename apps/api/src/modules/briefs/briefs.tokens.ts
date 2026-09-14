import { briefService } from "@destaworks/application/brief.service";
import { serviceToken } from "../service-token";

/**
 * The brief/target injection token, in its own module.
 *
 * Not in `briefs.module.ts`, because the module lists the controllers and each controller needs
 * the token: with both in one file the import cycle resolves the token to `undefined` at the
 * moment `@Inject(...)` evaluates, and Nest fails to construct the controller.
 */
export const BRIEF_SERVICE = serviceToken<typeof briefService>("BRIEF_SERVICE");
