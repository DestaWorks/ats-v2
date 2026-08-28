import { Module } from "@nestjs/common";
import { auditService } from "@destaworks/application/audit.service";
import { provideService } from "../service-token";
import { ActivityController } from "./activity.controller";
import { AUDIT_SERVICE } from "./activity.tokens";

export { AUDIT_SERVICE };

/**
 * Reads of the `activity_log` audit trail. That table deliberately holds PII under
 * capability-restricted access — it is the compliance record, not observability telemetry —
 * so this module's endpoints are gated reads, and writes happen as a side effect of mutations
 * elsewhere.
 */
@Module({
  controllers: [ActivityController],
  providers: [provideService(AUDIT_SERVICE, auditService)],
  exports: [AUDIT_SERVICE],
})
export class ActivityModule {}
