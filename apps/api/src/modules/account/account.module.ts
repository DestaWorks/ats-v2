import { Module } from "@nestjs/common";
import { userPreferencesService } from "@destaworks/application/user-preferences.service";
import { learnService } from "@destaworks/application/learn.service";
import { provideService } from "../service-token";
import { MeController } from "./me.controller";
import { LEARN_SERVICE, USER_PREFERENCES_SERVICE } from "./account.tokens";

export { LEARN_SERVICE, USER_PREFERENCES_SERVICE };

/**
 * The signed-in operator's own record: identity, UI preferences and Learn progress. Everything
 * here is scoped to the caller, never to another user — administering *other* accounts is
 * `AdminModule`.
 */
@Module({
  controllers: [MeController],
  providers: [
    provideService(USER_PREFERENCES_SERVICE, userPreferencesService),
    provideService(LEARN_SERVICE, learnService),
  ],
  exports: [USER_PREFERENCES_SERVICE, LEARN_SERVICE],
})
export class AccountModule {}
