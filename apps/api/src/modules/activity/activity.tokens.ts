import { auditService } from "@destaworks/application/audit.service";
import { serviceToken } from "../service-token";

/**
 * The module's injection tokens, declared apart from the module itself — see `health.tokens.ts`
 * for why: tokens declared beside a module that imports its own controller are in their temporal
 * dead zone when `@Inject(TOKEN)` runs.
 */
export const AUDIT_SERVICE = serviceToken<typeof auditService>("AUDIT_SERVICE");
