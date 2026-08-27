import { Module } from "@nestjs/common";
import { openRoleService } from "@destaworks/application/open-role.service";
import { provideService, serviceToken } from "../service-token";

export const OPEN_ROLE_SERVICE = serviceToken<typeof openRoleService>("OPEN_ROLE_SERVICE");

/**
 * Open roles a client is hiring for, and the match profiles candidates are scored against. Not
 * to be confused with the account role enum, which is `@destaworks/auth`'s concern.
 *
 * Wiring only until Phase 4.3 adds the controllers: the services are bound to tokens and exported,
 * so a controller injects one instead of importing the singleton and becoming untestable.
 */
@Module({
  providers: [provideService(OPEN_ROLE_SERVICE, openRoleService)],
  exports: [OPEN_ROLE_SERVICE],
})
export class RolesModule {}
