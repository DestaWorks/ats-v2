import { resumeService } from "@destaworks/application/resume.service";
import { serviceToken } from "../service-token";

/**
 * The injection token for the resume service, declared apart from the module that binds it — see
 * `candidates.tokens.ts` for why a token declared beside its `@Module` resolves to `undefined`.
 */
export const RESUME_SERVICE = serviceToken<typeof resumeService>("RESUME_SERVICE");
