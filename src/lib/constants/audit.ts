/**
 * Audit vocabulary — the read-only `action`/`entity` unions written by `writeAudit`, plus display
 * labels and `Badge` tones for the Activity Log view (Wave 2.5). Isomorphic (client renders the
 * labels/tones) — pure data + type guards, no PII, no server imports.
 *
 * These mirror what the services actually write today (grep-confirmed) — they are VALIDATION vocab
 * (filter selects + a humanized label map), NOT a schema change: `action`/`entity` stay free-form
 * `String` columns. Legacy/ETL rows may carry values outside these unions; the label helpers
 * humanize any raw string so such rows still DISPLAY, while the filter selects only offer the known
 * set.
 */

import type { BadgeTone } from "@/components/ui/badge";

/** Every audit `action` the services write today (`writeAudit(..., action, ...)`). */
export const AUDIT_ACTIONS = [
  "create",
  "update",
  "move",
  "verify_license",
  "add_note",
  "attach",
  "delete",
  "restore",
  "purge",
  "import",
  "commit",
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

/** Every audit `entity` the services write today. */
export const AUDIT_ENTITIES = ["candidate", "document", "import_batch"] as const;
export type AuditEntity = (typeof AUDIT_ENTITIES)[number];

export function isAuditAction(value: string): value is AuditAction {
  return (AUDIT_ACTIONS as readonly string[]).includes(value);
}

export function isAuditEntity(value: string): value is AuditEntity {
  return (AUDIT_ENTITIES as readonly string[]).includes(value);
}

/** Human labels for the known actions (the filter select + the row Action pill). */
export const AUDIT_ACTION_LABEL: Record<AuditAction, string> = {
  create: "Create",
  update: "Update",
  move: "Move stage",
  verify_license: "Verify license",
  add_note: "Add note",
  attach: "Attach document",
  delete: "Delete",
  restore: "Restore",
  purge: "Purge",
  import: "Import",
  commit: "Commit import",
};

/** Human labels for the known entities (the filter select + the row Entity column). */
export const AUDIT_ENTITY_LABEL: Record<AuditEntity, string> = {
  candidate: "Candidate",
  document: "Document",
  import_batch: "Import batch",
};

/**
 * `Badge` tone per action (the Action pill): destructive actions read `danger`, restorative reads
 * `success`, mutations read `navy`, and lower-signal reads stay `neutral`/`amber`.
 */
export const AUDIT_ACTION_TONE: Record<AuditAction, BadgeTone> = {
  create: "navy",
  update: "navy",
  move: "navy",
  verify_license: "success",
  add_note: "neutral",
  attach: "neutral",
  delete: "danger",
  restore: "success",
  purge: "danger",
  import: "amber",
  commit: "amber",
};

/** Humanize a raw action string ("verify_license" → "Verify license"); tolerant of legacy/ETL codes. */
export function auditActionLabel(action: string): string {
  if (isAuditAction(action)) return AUDIT_ACTION_LABEL[action];
  return action
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/** Humanize a raw entity string; tolerant of legacy/ETL values. */
export function auditEntityLabel(entity: string): string {
  if (isAuditEntity(entity)) return AUDIT_ENTITY_LABEL[entity];
  return entity
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/** `Badge` tone for a raw action string; unknown/legacy actions fall back to `neutral`. */
export function auditActionTone(action: string): BadgeTone {
  return isAuditAction(action) ? AUDIT_ACTION_TONE[action] : "neutral";
}
