/**
 * Isomorphic client-side API helpers. Shared by every feature that POSTs to a gated API route and
 * needs to turn the uniform `{ error: { code, message, issues? } }` envelope into a discriminated
 * result the UI can render (field issues → `form.setError`, other codes → an `ErrorState`). No
 * server imports — this module is safe to bundle into any client component (and the plain
 * `FieldIssue` type is shared back into the server `api-handler`).
 */

/** One field-level validation issue from a 422 (`path` is a dotted key, e.g. `"email"`). */
export interface FieldIssue {
  path: string;
  message: string;
}

/** The uniform error envelope every gated route returns (see `server/http/api-handler.ts`). */
export interface ApiErrorBody {
  error?: { code?: string; message?: string; issues?: FieldIssue[] };
}

/** A failed mutation — the envelope's code/message plus any field issues (for `form.setError`). */
export interface ApiFailure {
  code: string;
  message: string;
  issues: FieldIssue[];
}

/** Discriminated result of a mutation: the parsed body on success, a failure envelope otherwise. */
export type ApiResult<T> = { ok: true; data: T } | { ok: false; failure: ApiFailure };

/** Parse a non-OK `Response` into an `ApiFailure` (never throws — a non-JSON body → the fallbacks). */
export async function readFailure(res: Response): Promise<ApiFailure> {
  const body = (await res.json().catch(() => ({}))) as ApiErrorBody;
  return {
    code: body.error?.code ?? "UNKNOWN",
    message: body.error?.message ?? "Something went wrong. Please try again.",
    issues: body.error?.issues ?? [],
  };
}

/** Human-friendly lead-in for a failure — maps the common gated codes, falls back to the message. */
export function messageForFailure(failure: ApiFailure): string {
  if (failure.code === "FORBIDDEN") {
    return failure.message || "You don't have permission to do that.";
  }
  if (failure.code === "UNAUTHORIZED") return "Your session expired. Please sign in again.";
  if (failure.code === "NOT_FOUND") return "This candidate no longer exists.";
  return failure.message || "Something went wrong. Please try again.";
}

/** Issue `fetch(url, init)` and turn a non-OK response into an `ApiFailure` (shared by every verb below). */
async function request<T>(url: string, init: RequestInit): Promise<ApiResult<T>> {
  const res = await fetch(url, init);
  if (!res.ok) return { ok: false, failure: await readFailure(res) };
  const data = (await res.json()) as T;
  return { ok: true, data };
}

/** A JSON body request — `Content-Type` header + serialized body (shared by POST/PATCH/PUT). */
function jsonRequestInit(method: string, body: unknown): RequestInit {
  return { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}

/** GET `url` as JSON, returning the parsed response `T` on success or an `ApiFailure`. */
export function getJson<T>(url: string): Promise<ApiResult<T>> {
  return request<T>(url, {});
}

/** POST `body` as JSON to `url`, returning the parsed response `T` on success or an `ApiFailure`. */
export function postJson<T>(url: string, body: unknown): Promise<ApiResult<T>> {
  return request<T>(url, jsonRequestInit("POST", body));
}

/** PATCH `body` as JSON to `url`, returning the parsed response `T` on success or an `ApiFailure`. */
export function patchJson<T>(url: string, body: unknown): Promise<ApiResult<T>> {
  return request<T>(url, jsonRequestInit("PATCH", body));
}

/** PUT `body` as JSON to `url`, returning the parsed response `T` on success or an `ApiFailure`. */
export function putJson<T>(url: string, body: unknown): Promise<ApiResult<T>> {
  return request<T>(url, jsonRequestInit("PUT", body));
}

/** DELETE `url`, returning the parsed response `T` on success or an `ApiFailure`. */
export function deleteJson<T>(url: string): Promise<ApiResult<T>> {
  return request<T>(url, { method: "DELETE" });
}
