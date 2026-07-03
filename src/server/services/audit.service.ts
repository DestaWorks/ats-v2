import "server-only";
import { requireCapability } from "@/server/auth/guards";
import { auditRepository } from "@/server/repositories/audit.repository";

/**
 * Audit-trail read logic. Services orchestrate repositories and own authz; they never
 * import Prisma directly.
 *
 * The capability gate is load-bearing: `activity_log` rows carry `before`/`after` snapshots
 * that may contain PII/PHI, so reads are restricted to `viewAudit` (admin-only) — the
 * conservative compliance default (HIPAA / Ethiopian DPP). Widen later if the product needs
 * leadership to read the trail.
 */
export const auditService = {
  async listAuditForEntity(entity: string, entityId: string) {
    await requireCapability("viewAudit");
    return auditRepository.listForEntity(entity, entityId);
  },
};
