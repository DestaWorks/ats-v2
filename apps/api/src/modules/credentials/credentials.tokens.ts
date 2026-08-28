import { credentialsIntelligenceService } from "@destaworks/application/credentials-intelligence.service";
import { licenseVerifyService } from "@destaworks/application/license-verify.service";
import { serviceToken } from "../service-token";

/**
 * The injection tokens for credentials, declared apart from the module that binds them — see
 * `candidates.tokens.ts` for why a token declared beside its `@Module` resolves to `undefined`.
 */
export const CREDENTIALS_INTELLIGENCE_SERVICE = serviceToken<typeof credentialsIntelligenceService>(
  "CREDENTIALS_INTELLIGENCE_SERVICE",
);
export const LICENSE_VERIFY_SERVICE =
  serviceToken<typeof licenseVerifyService>("LICENSE_VERIFY_SERVICE");
