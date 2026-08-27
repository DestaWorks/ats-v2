import { Module } from "@nestjs/common";
import { userPreferencesService } from "@destaworks/application/user-preferences.service";
import { learnService } from "@destaworks/application/learn.service";
import { provideService, serviceToken } from "../service-token";

export const USER_PREFERENCES_SERVICE = serviceToken<typeof userPreferencesService>(
  "USER_PREFERENCES_SERVICE",
);
export const LEARN_SERVICE = serviceToken<typeof learnService>("LEARN_SERVICE");

/**
 * The signed-in operator's own record: UI preferences and Learn progress. Everything here is
 * scoped to the caller, never to another user — administering *other* accounts is `AdminModule`.
 *
 * Wiring only until Phase 4.3 adds the controllers: the services are bound to tokens and exported,
 * so a controller injects one instead of importing the singleton and becoming untestable.
 */
@Module({
  providers: [
    provideService(USER_PREFERENCES_SERVICE, userPreferencesService),
    provideService(LEARN_SERVICE, learnService),
  ],
  exports: [USER_PREFERENCES_SERVICE, LEARN_SERVICE],
})
export class AccountModule {}
