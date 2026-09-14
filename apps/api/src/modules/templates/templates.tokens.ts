import { templatePerformanceService } from "@destaworks/application/template-performance.service";
import { serviceToken } from "../service-token";

/**
 * The injection token for template performance, declared apart from the module that binds it — see
 * `candidates.tokens.ts` for why a token declared beside its `@Module` resolves to `undefined`.
 */
export const TEMPLATE_PERFORMANCE_SERVICE = serviceToken<typeof templatePerformanceService>(
  "TEMPLATE_PERFORMANCE_SERVICE",
);
