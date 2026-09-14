import { Module } from "@nestjs/common";
import { openRoleService } from "@destaworks/application/open-role.service";
import { provideService } from "../service-token";
import { ClientMatchProfilesController } from "./client-match-profiles.controller";
import { RolesController } from "./roles.controller";
import { OPEN_ROLE_SERVICE } from "./roles.tokens";

export { OPEN_ROLE_SERVICE };

/**
 * Open roles — the client-side demand the matcher ranks leads against, plus the JD parser, the
 * triage strip, and the match profiles candidates are scored against. Not to be confused with the
 * account role enum, which is `@destaworks/auth`'s concern.
 */
@Module({
  controllers: [RolesController, ClientMatchProfilesController],
  providers: [provideService(OPEN_ROLE_SERVICE, openRoleService)],
  exports: [OPEN_ROLE_SERVICE],
})
export class RolesModule {}
