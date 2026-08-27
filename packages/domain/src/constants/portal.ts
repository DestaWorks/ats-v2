/**
 * Client Portal vocabulary (Wave 4.3). Legacy's `?portal=true` mode curated which pipeline
 * stages an external client sees — hiding New/Not-Qualified/No-Response/Client-Rejected/
 * Future-Pipeline is sensible UX (a client shouldn't see candidates that never got anywhere),
 * unlike its auth/redaction, which was broken and is NOT ported (see docs/IMPLEMENTATION-PLAN.md
 * Wave 4.3 notes).
 */
import type { CandidateStatus } from "./pipeline-status";

/**
 * The 5 of 13 statuses shown in the portal — submission and later, ONLY.
 *
 * Narrowed from 8 (audit 2026-08-21). The three pre-submission stages legacy also showed
 * (`QUALIFIED_PRESCREEN`, `INITIAL_SCREENING`, `DESTA_REVIEW`) disclosed a candidate's full
 * legal name AND current employer to a client we had not yet submitted them to — enough to
 * identify and approach a clinician who is job-hunting confidentially, or to out them to their
 * employer. Once a candidate reaches `SUBMITTED_TO_CLIENT` that disclosure is the point.
 */
export const PORTAL_VISIBLE_STATUS_CODES: readonly CandidateStatus[] = [
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
