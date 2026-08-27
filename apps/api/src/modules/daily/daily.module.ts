import { Module } from "@nestjs/common";
import { dailyService } from "@destaworks/application/daily.service";
import { provideService, serviceToken } from "../service-token";

export const DAILY_SERVICE = serviceToken<typeof dailyService>("DAILY_SERVICE");

/**
 * The daily activity log — per-day recruiter activity over half-open `[start, end)` windows.
 *
 * Wiring only until Phase 4.3 adds the controllers: the services are bound to tokens and exported,
 * so a controller injects one instead of importing the singleton and becoming untestable.
 */
@Module({
  providers: [provideService(DAILY_SERVICE, dailyService)],
  exports: [DAILY_SERVICE],
})
export class DailyModule {}
