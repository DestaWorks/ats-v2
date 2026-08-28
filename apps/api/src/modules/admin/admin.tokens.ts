import { adminUserService } from "@destaworks/application/admin-user.service";
import { accessRequestService } from "@destaworks/application/access-request.service";
import { aiOpsService } from "@destaworks/application/ai-ops.service";
import { serviceToken } from "../service-token";

/**
 * The module's injection tokens, declared apart from the module itself — see `health.tokens.ts`
 * for why: tokens declared beside a module that imports its own controllers are in their temporal
 * dead zone when `@Inject(TOKEN)` runs.
 */
export const ADMIN_USER_SERVICE = serviceToken<typeof adminUserService>("ADMIN_USER_SERVICE");
export const ACCESS_REQUEST_SERVICE =
  serviceToken<typeof accessRequestService>("ACCESS_REQUEST_SERVICE");
export const AI_OPS_SERVICE = serviceToken<typeof aiOpsService>("AI_OPS_SERVICE");
