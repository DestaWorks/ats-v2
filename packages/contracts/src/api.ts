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
