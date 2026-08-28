import { Module } from "@nestjs/common";
import { dailyService } from "@destaworks/application/daily.service";
import { provideService } from "../service-token";
import { DailyController } from "./daily.controller";
import { DAILY_SERVICE } from "./daily.tokens";

/**
 * The daily activity log — per-day recruiter activity over half-open `[start, end)` windows.
 *
 * The service is bound to a token (`daily.tokens.ts`) rather than imported by the controller, so
 * `DailyController` injects it instead of reaching for the singleton and becoming untestable.
 */
@Module({
  controllers: [DailyController],
  providers: [provideService(DAILY_SERVICE, dailyService)],
  exports: [DAILY_SERVICE],
})
export class DailyModule {}
