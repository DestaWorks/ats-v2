/**
 * Activity Log contract (Wave 2.5) — the isomorphic interface shared by the audit read service,
 * the `/api/activity` routes, and the client Activity view. Pure types + zod (no server imports),
 * so the frontend imports the same request schema and response shapes the server validates against.
 *
 * See `docs/design/activity-log.md`. The LIST row deliberately OMITS the raw `before`/`after`
 * snapshots (AL-3): they may carry whole-entity PII/PHI, so a row carries only `hasChanges`, and
 * the heavy snapshots load on demand via the detail endpoint (`ActivityDetailDTO`). Date-range
 * filters are interpreted as UTC day-bounds in the service (`to` widened to end-of-day).
 */
import { z } from "zod";
import { AUDIT_ACTIONS, AUDIT_ENTITIES } from "@/lib/constants";

/**
 * The `/api/activity` query params. `from`/`to` are `YYYY-MM-DD` day strings (coerced to Date,
 * interpreted as UTC day-bounds in the service); `cursor` is an opaque keyset cursor. All optional
 * — the empty query is the unfiltered whole-log read.
 */
export const activityQuerySchema = z.object({
  action: z.enum(AUDIT_ACTIONS).optional(),
  entity: z.enum(AUDIT_ENTITIES).optional(),
  actor: z.string().min(1).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  cursor: z.string().min(1).optional(),
});
export type ActivityQuery = z.infer<typeof activityQuerySchema>;

/**
 * One LIST row. NO raw `before`/`after` (AL-3) — carries only `hasChanges`. `at` is an ISO string.
 * `action`/`entity` are raw codes (the client humanizes via `auditActionLabel`/`auditEntityLabel`)
 * so legacy/ETL values still display. `entityLabel`/`entityLink` are resolved for candidates only.
 */
export interface ActivityItemDTO {
  id: string;
  at: string;
  actorId: string;
  /** Resolved display name; "Unknown" when the user row is gone (e.g. legacy/ETL actor). */
  actorName: string;
  action: string;
  entity: string;
  entityId: string;
  /** Candidate name when resolvable (incl. soft-deleted); null for purged / non-candidate rows. */
  entityLabel?: string | null;
  /** `/candidates/[id]` only for a LIVE (non-deleted) candidate; null otherwise. */
  entityLink?: string | null;
  hasChanges: boolean;
}

/** A keyset page of activity rows. */
export interface ActivityListDTO {
  items: ActivityItemDTO[];
  nextCursor: string | null;
  hasMore: boolean;
}

/** The on-demand detail — the whole-entity JSON snapshots (PII permitted; viewer holds `viewAudit`). */
export interface ActivityDetailDTO {
  id: string;
  before: unknown | null;
  after: unknown | null;
}

/** A resolved actor for the filter picker (distinct actors that appear in the log). */
export interface ActivityActorOption {
  id: string;
  name: string;
}
