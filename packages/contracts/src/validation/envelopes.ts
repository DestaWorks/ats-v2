import type { CandidateProfileDTO, DocumentSummaryDTO, NoteDTO } from "./candidate";
import type { OutreachAttemptDTO } from "./lead";
import type { ScreeningCandidateDTO, ScreeningScorecardDTO } from "./screening";

/**
 * The response envelopes shared by an App Router route and the NestJS controller that replaces it
 * (SAAS-RESTRUCTURE-PLAN 4.3). During the cutover both serve the same path, so the wire shape has
 * to have exactly one definition: `apps/api` cannot import a type from `apps/web`, and a second
 * copy is drift waiting to happen the first time one side gains a field.
 *
 * Each route still exports its `<Method><Resource>Response` name — that is what the client fetchers
 * import and what the contract check looks for — but as an alias of the shape declared here.
 *
 * Envelopes whose payload is a `@destaworks/application` DTO cannot live here: `CandidateDTO` is
 * derived from the database row and is the output type of the PII gate, and contracts may not
 * depend on application. Those are in `@destaworks/application/candidate.wire`.
 *
 * Filed under `validation/` because that is the only directory this package's export map exposes.
 */

/** One candidate's profile projection — `GET /api/candidates/:id`. */
export interface CandidateProfileEnvelope {
  candidate: CandidateProfileDTO;
}

/**
 * An acknowledgement carrying only the id acted on, for the two destructive candidate endpoints
 * (`DELETE /api/candidates/:id`, `POST /api/candidates/:id/purge`). Deliberately never PII: after a
 * purge the record is gone, and a soft delete has no reason to echo the candidate back.
 */
export interface CandidateAckEnvelope {
  ok: true;
  id: string;
}

/**
 * The persisted pipeline fields after a move — `POST /api/candidates/:id/move`. Not a candidate
 * DTO: the board already holds the card and only needs the stage the server actually recorded, so
 * this response carries no email, phone or licence data at all.
 */
export interface MovedCandidateEnvelope {
  candidate: {
    id: string;
    status: string;
    stageOrder: number;
    stageEnteredAt: string;
  };
}

/** A single note — `POST /api/candidates/:id/notes`. */
export interface NoteEnvelope {
  note: NoteDTO;
}

/** The viewer-scoped notes for one candidate — `GET /api/candidates/:id/notes`. */
export interface NoteListEnvelope {
  notes: NoteDTO[];
}

/** One logged outreach attempt — `POST /api/candidates/:id/outreach`. */
export interface OutreachAttemptEnvelope {
  attempt: OutreachAttemptDTO;
}

/** A newly attached document's summary — `POST /api/candidates/:id/resume`. */
export interface DocumentSummaryEnvelope {
  document: DocumentSummaryDTO;
}

/** A short-lived signed URL — `GET /api/documents/:id/download-url`. */
export interface DownloadUrlEnvelope {
  url: string;
}

/** The persisted screening scorecard — `POST /api/screening/:candidateId`. */
export interface ScreeningScorecardEnvelope {
  scorecard: ScreeningScorecardDTO;
}

/** The screening picker's eligible candidates — `GET /api/screening/candidates`. */
export interface ScreeningCandidateListEnvelope {
  candidates: ScreeningCandidateDTO[];
}
