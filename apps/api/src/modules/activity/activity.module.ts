import { Module } from "@nestjs/common";
import { auditService } from "@destaworks/application/audit.service";
import { provideService, serviceToken } from "../service-token";

export const AUDIT_SERVICE = serviceToken<typeof auditService>("AUDIT_SERVICE");

/**
 * Reads of the `activity_log` audit trail. That table deliberately holds PII under
 * capability-restricted access — it is the compliance record, not observability telemetry —
 * so this module's endpoints are gated reads, and writes happen as a side effect of mutations
 * elsewhere.
 *
 * Wiring only until Phase 4.3 adds the controllers: the services are bound to tokens and exported,
 * so a controller injects one instead of importing the singleton and becoming untestable.
 */
@Module({
  providers: [provideService(AUDIT_SERVICE, auditService)],
  exports: [AUDIT_SERVICE],
})
export class ActivityModule {}
