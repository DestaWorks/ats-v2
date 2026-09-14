/**
 * The uniform error envelope every gated route returns, and the discriminated result the client
 * branches on. These are wire types — the server's `apiHandler` produces them and the browser's
 * fetch helpers consume them — so they live here rather than in either side's implementation.
 */

/** One field-level validation issue from a 422 (`path` is a dotted key, e.g. `"email"`). */
export interface FieldIssue {
  path: string;
  message: string;
}

/** The uniform error envelope every gated route returns. */
export interface ApiErrorBody {
  error?: { code?: string; message?: string; issues?: FieldIssue[] };
}

/** A failed mutation — the envelope's code/message plus any field issues. */
export interface ApiFailure {
  code: string;
  message: string;
  issues: FieldIssue[];
}

/**
 * The acknowledgement a mutation returns when the only fact worth reporting is "done, to this
 * row" — a delete, or a decline that transitions a request to a terminal state. Declared once
 * because several unrelated areas answer with it, and a per-route copy is how the `ok` flag and
 * the id key drift apart between two endpoints the same client calls.
 */
export interface AcknowledgedIdDTO {
  ok: true;
  id: string;
}

/**
 * Shapes more than one resource answers with. They live beside the error envelope for the same
 * reason it does: a wire shape two areas return must be ONE declaration, or the two drift. Each is
 * aliased under its `<Method><Resource>Response` name where it is served.
 */

/**
 * A soft delete: the id that was trashed, and nothing else — never the deleted row's PII.
 *
 * Structurally this IS `AcknowledgedIdDTO`, so it is an alias rather than a second declaration:
 * two identical wire shapes declared separately are precisely how the `ok` flag and the id key
 * drift apart between endpoints the same client calls.
 */
export type SoftDeletedResponse = AcknowledgedIdDTO;

/** A bulk action over ids: rows changed, and rows skipped server-side as ineligible. */
export interface BulkActionCounts {
  affected: number;
  skipped: number;
}

/** A bulk insert: rows created, and rows skipped server-side as duplicates. */
export interface BulkAddCounts {
  added: number;
  skipped: number;
}

/** A promotion into the candidate pipeline: the new candidate's id, and nothing else. */
export interface PromotedCandidateResponse {
  candidateId: string;
}
