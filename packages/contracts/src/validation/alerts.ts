/**
 * Alerts contract — the composite the bell panel polls (legacy header "Alerts" pill parity).
 * Pure types (NO server imports). The badge counts UNREAD MENTIONS ONLY (legacy line 1194);
 * the three derived buckets are viewer-scoped (candidates the viewer added) and informational.
 * Wire dates are ISO strings.
 */
import type { MentionDTO } from "./mention";

/** One derived-alert candidate row (no PII beyond name — never license numbers/emails). */
export interface AlertCandidateDTO {
  id: string;
  name: string;
  statusLabel: string;
  credential: string | null;
  clientName: string | null;
  licenseState: string | null;
}

/** One derived bucket: the TRUE count + the top rows (capped server-side at 5, legacy parity). */
export interface AlertBucketDTO {
  count: number;
  items: AlertCandidateDTO[];
}

/** The `GET /api/alerts` payload. */
export interface AlertsDTO {
  /** Recent mentions (unread first ordering is by date; the client splits read/unread). */
  mentions: MentionDTO[];
  /** True unread-mention count — THE badge number (derived buckets never count toward it). */
  unread: number;
  /** Viewer's candidates past their per-stage SLA (stages with `slaDays` only). */
  overdue: AlertBucketDTO;
  /** Viewer's candidates sitting in `0 - New Candidate`. */
  newToReview: AlertBucketDTO;
  /** Viewer's candidates with an unverified license, excluding Future Pipeline. */
  verificationPending: AlertBucketDTO;
}
