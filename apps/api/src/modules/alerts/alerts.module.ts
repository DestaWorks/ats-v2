import { Module } from "@nestjs/common";
import { alertService } from "@destaworks/application/alert.service";
import { provideService, serviceToken } from "../service-token";

export const ALERT_SERVICE = serviceToken<typeof alertService>("ALERT_SERVICE");

/**
 * Operator alerts — the notifications surfaced in the app's alert bell.
 *
 * Wiring only until Phase 4.3 adds the controllers: the services are bound to tokens and exported,
 * so a controller injects one instead of importing the singleton and becoming untestable.
 */
@Module({
  providers: [provideService(ALERT_SERVICE, alertService)],
  exports: [ALERT_SERVICE],
})
export class AlertsModule {}
