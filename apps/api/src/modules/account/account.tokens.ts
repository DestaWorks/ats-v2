import { userPreferencesService } from "@destaworks/application/user-preferences.service";
import { learnService } from "@destaworks/application/learn.service";
import { serviceToken } from "../service-token";

/**
 * The module's injection tokens, declared apart from the module itself — see `health.tokens.ts`
 * for why: a controller imports the token, the module imports the controller, and `@Inject(TOKEN)`
 * runs at class-definition time, so tokens declared in the module file are in their temporal dead
 * zone when the controller needs them.
 */
export const USER_PREFERENCES_SERVICE = serviceToken<typeof userPreferencesService>(
  "USER_PREFERENCES_SERVICE",
);
export const LEARN_SERVICE = serviceToken<typeof learnService>("LEARN_SERVICE");
