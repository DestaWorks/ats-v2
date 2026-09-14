import { savedViewService } from "@destaworks/application/saved-view.service";
import { serviceToken } from "../service-token";

/**
 * The module's injection tokens, declared beside the module rather than inside it.
 *
 * A `.module.ts` imports its controllers and a controller injects a token, so a token declared in
 * the module file would close an ESM cycle: the controller's `@Inject(...)` runs while the module
 * body is still suspended on that import, and reads the token in its temporal dead zone. That is a
 * boot-time `ReferenceError`, not a type error, so nothing but running the app would catch it.
 */
export const SAVED_VIEW_SERVICE = serviceToken<typeof savedViewService>("SAVED_VIEW_SERVICE");
