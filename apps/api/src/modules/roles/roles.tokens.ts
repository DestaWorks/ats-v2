import { openRoleService } from "@destaworks/application/open-role.service";
import { serviceToken } from "../service-token";

/**
 * The open-role area's injection token, kept out of `roles.module.ts` so the module can import its
 * controller and the controller can name the token without an ES module cycle — `@Inject` evaluates
 * at class-definition time, so a cycle here is a boot-time ReferenceError, not a warning.
 */
export const OPEN_ROLE_SERVICE = serviceToken<typeof openRoleService>("OPEN_ROLE_SERVICE");
