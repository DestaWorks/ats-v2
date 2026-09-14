import { Module } from "@nestjs/common";
import { alertService } from "@destaworks/application/alert.service";
import { provideService } from "../service-token";
import { AlertsController } from "./alerts.controller";
import { ALERT_SERVICE } from "./alerts.tokens";

export { ALERT_SERVICE };

/** Operator alerts — the notifications surfaced in the app's alert bell. */
@Module({
  controllers: [AlertsController],
  providers: [provideService(ALERT_SERVICE, alertService)],
  exports: [ALERT_SERVICE],
})
export class AlertsModule {}
