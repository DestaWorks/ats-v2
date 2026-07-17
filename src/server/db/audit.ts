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
 * Field-crypto-designated PII/PHI columns (SECURITY-AUDIT-APP.md H1/H2) that must never land in
 * `activity_log` as plaintext — regardless of whether `FIELD_ENCRYPTION_KEY` is set, since the
 * trail is a permanent, append-only record read by `viewAudit` (a broader audience than "who can
 * edit this candidate"). Redacted at this single choke point so every caller is covered, present
 * and future, without each service needing to remember to narrow its own before/after payload.
 */
const SENSITIVE_AUDIT_KEYS = new Set([
  "licenseNumber",
  "email",
  "phone",
  "npi",
  "extractedText",
  "extractedData",
]);

function redactSensitive(value: unknown): unknown {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(redactSensitive);
  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    out[key] = SENSITIVE_AUDIT_KEYS.has(key) && val != null ? "[REDACTED]" : redactSensitive(val);
  }
  return out;
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
      before: redactSensitive(params.before) as Prisma.InputJsonValue | undefined,
      after: redactSensitive(params.after) as Prisma.InputJsonValue | undefined,
    },
  });
}
