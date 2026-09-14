import { dailyService } from "@destaworks/application/daily.service";
import { serviceToken } from "../service-token";

/**
 * The daily-loop injection token, in its own module.
 *
 * Not in `daily.module.ts`, because the module lists the controller and the controller needs the
 * token: with both in one file the import cycle resolves the token to `undefined` at the moment
 * `@Inject(...)` evaluates, and Nest fails to construct the controller.
 */
export const DAILY_SERVICE = serviceToken<typeof dailyService>("DAILY_SERVICE");
