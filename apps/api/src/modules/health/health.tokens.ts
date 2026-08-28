import { healthService } from "@destaworks/application/health.service";
import { serviceToken } from "../service-token";

/**
 * The module's injection tokens, declared apart from the module itself.
 *
 * A controller imports the token it injects, and the module imports the controller to register it.
 * With both in one file that is an ESM cycle, and `@Inject(TOKEN)` is evaluated when the
 * controller class is defined — while the module body has not run and the token is still in its
 * temporal dead zone. The app would fail to boot with a `ReferenceError`, not a DI error. Keeping
 * tokens in a leaf module that imports no controller removes the cycle at its source.
 */
export const HEALTH_SERVICE = serviceToken<typeof healthService>("HEALTH_SERVICE");
