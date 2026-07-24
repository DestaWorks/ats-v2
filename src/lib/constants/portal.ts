/**
 * Client Portal vocabulary (Wave 4.3). Legacy's `?portal=true` mode curated which pipeline
 * stages an external client sees — hiding New/Not-Qualified/No-Response/Client-Rejected/
 * Future-Pipeline is sensible UX (a client shouldn't see candidates that never got anywhere),
 * unlike its auth/redaction, which was broken and is NOT ported (see docs/IMPLEMENTATION-PLAN.md
 * Wave 4.3 notes).
 */
import type { CandidateStatus } from "./pipeline-status";

/** The 8 of 13 statuses shown in the portal — everything except the 5 legacy also hid. */
export const PORTAL_VISIBLE_STATUS_CODES: readonly CandidateStatus[] = [
  "QUALIFIED_PRESCREEN",
  "INITIAL_SCREENING",
  "DESTA_REVIEW",
  "SUBMITTED_TO_CLIENT",
  "CLIENT_INTERVIEW",
  "OFFER_NEGOTIATION",
  "OFFER_ACCEPTED",
  "STARTED_DAY1",
];

/** A generated portal link is valid for this long from creation; generating a new one for the
 *  same contact revokes any prior link (one live link per contact at a time). */
export const PORTAL_TOKEN_TTL_DAYS = 30;

/** HttpOnly cookie name for the portal session (path `/`, see `portal-guards.ts`/`portal/access/route.ts`). */
export const PORTAL_TOKEN_COOKIE = "portal_token";
