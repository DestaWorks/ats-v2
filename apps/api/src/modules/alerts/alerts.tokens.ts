import { alertService } from "@destaworks/application/alert.service";
import { serviceToken } from "../service-token";

/**
 * The module's injection tokens, declared apart from the module itself — see `health.tokens.ts`
 * for why: tokens declared beside a module that imports its own controller are in their temporal
 * dead zone when `@Inject(TOKEN)` runs.
 */
export const ALERT_SERVICE = serviceToken<typeof alertService>("ALERT_SERVICE");
