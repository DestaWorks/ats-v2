import { Module } from "@nestjs/common";
import { credentialsIntelligenceService } from "@destaworks/application/credentials-intelligence.service";
import { licenseVerifyService } from "@destaworks/application/license-verify.service";
import { provideService } from "../service-token";
import { CREDENTIALS_INTELLIGENCE_SERVICE, LICENSE_VERIFY_SERVICE } from "./credentials.tokens";
import { CredentialsController } from "./credentials.controller";
import { LicenseVerifyController } from "./license-verify.controller";

export { CREDENTIALS_INTELLIGENCE_SERVICE, LICENSE_VERIFY_SERVICE } from "./credentials.tokens";

/**
 * Credential and licensure state for clinical candidates — the credentials matrix and the
 * state-board license verification that feeds it.
 *
 * Two controllers because the two surfaces carry different gates: the matrix is a `viewCredentials`
 * leadership aggregate, the verification queue is open to any operator working the pipeline.
 */
@Module({
  controllers: [CredentialsController, LicenseVerifyController],
  providers: [
    provideService(CREDENTIALS_INTELLIGENCE_SERVICE, credentialsIntelligenceService),
    provideService(LICENSE_VERIFY_SERVICE, licenseVerifyService),
  ],
  exports: [CREDENTIALS_INTELLIGENCE_SERVICE, LICENSE_VERIFY_SERVICE],
})
export class CredentialsModule {}
