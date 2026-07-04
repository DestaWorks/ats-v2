import "server-only";
import type { Prisma } from "@/generated/prisma/client";

/**
 * Parameters for a single audit entry.
 *
 * SECURITY: `before`/`after` capture entity snapshots that may hold PII/PHI (candidate
 * names, emails, phones, license numbers, NPI). They are persisted for the audit trail
 * but MUST NEVER be written to app / observability logs. Reads of the trail are
 * capability-gated (`viewAudit`) — see `server/services/audit.service.ts`.
 */
export interface WriteAuditParams {
  entity: string;
  entityId: string;
  /** The acting user's id. */
  actor: string;
  action: string;
  before?: unknown;
  after?: unknown;
}

/**
 * Append one row to `activity_log`.
 *
 * Takes a Prisma transaction client (`tx`) as its first argument so the audit write runs
 * **inside the same transaction as the mutation it records** — the trail is atomic with the
 * change and can never drift from the data. Callers wrap the mutation + `writeAudit` in a
 * single `prisma.$transaction(...)`.
 */
export function writeAudit(tx: Prisma.TransactionClient, params: WriteAuditParams) {
  return tx.activityLog.create({
    data: {
      entity: params.entity,
      entityId: params.entityId,
      actor: params.actor,
      action: params.action,
      before: params.before as Prisma.InputJsonValue | undefined,
      after: params.after as Prisma.InputJsonValue | undefined,
    },
  });
}
