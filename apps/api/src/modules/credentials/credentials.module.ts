import { Module } from "@nestjs/common";
import { credentialsIntelligenceService } from "@destaworks/application/credentials-intelligence.service";
import { licenseVerifyService } from "@destaworks/application/license-verify.service";
import { provideService, serviceToken } from "../service-token";

export const CREDENTIALS_INTELLIGENCE_SERVICE = serviceToken<typeof credentialsIntelligenceService>(
  "CREDENTIALS_INTELLIGENCE_SERVICE",
);
export const LICENSE_VERIFY_SERVICE =
  serviceToken<typeof licenseVerifyService>("LICENSE_VERIFY_SERVICE");

/**
 * Credential and licensure state for clinical candidates — the credentials matrix and the
 * state-board license verification that feeds it.
 *
 * Wiring only until Phase 4.3 adds the controllers: the services are bound to tokens and exported,
 * so a controller injects one instead of importing the singleton and becoming untestable.
 */
@Module({
  providers: [
    provideService(CREDENTIALS_INTELLIGENCE_SERVICE, credentialsIntelligenceService),
    provideService(LICENSE_VERIFY_SERVICE, licenseVerifyService),
  ],
  exports: [CREDENTIALS_INTELLIGENCE_SERVICE, LICENSE_VERIFY_SERVICE],
})
export class CredentialsModule {}
