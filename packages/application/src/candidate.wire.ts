import type { CandidateDTO } from "./candidate.dto";
import type { DocumentDTO } from "./document.dto";

/**
 * The two response envelopes that carry a candidate as the PII gate produced it, shared by an App
 * Router route and the NestJS controller that replaces it (SAAS-RESTRUCTURE-PLAN 4.3).
 *
 * They live here rather than in `@destaworks/contracts` because `CandidateDTO` does:
 * it is derived from the database row and is the OUTPUT TYPE OF `toCandidateDTO`, whose
 * `licenseNumber` key is present only for a viewer holding `viewCredentials`. Contracts may not
 * depend on application, so moving the envelope without moving the gate would fork the type that
 * encodes the gate — the one type in this system that must not be restated. The pure envelopes are
 * in `@destaworks/contracts/validation/envelopes`.
 */

/**
 * One candidate as the viewer is allowed to see it — create, update, restore and verify-license all
 * answer with this. `licenseNumber` is OPTIONAL in `CandidateDTO` precisely because the mapper omits
 * the key entirely for a viewer without `viewCredentials`.
 */
export interface CandidateEnvelope {
  candidate: CandidateDTO;
}

/** The attached-or-created candidate plus its stored document — `POST /api/resume/save`. */
export interface ResumeSaveEnvelope {
  candidate: CandidateDTO;
  document: DocumentDTO;
}
