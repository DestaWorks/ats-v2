import { screeningService } from "@destaworks/application/screening.service";
import { serviceToken } from "../service-token";

/**
 * The injection token for the screening service, declared apart from the module that binds it — see
 * `candidates.tokens.ts` for why a token declared beside its `@Module` resolves to `undefined`.
 */
export const SCREENING_SERVICE = serviceToken<typeof screeningService>("SCREENING_SERVICE");
