/**
 * Isomorphic client-side API helpers. Shared by every feature that POSTs to a gated API route and
 * needs to turn the uniform `{ error: { code, message, issues? } }` envelope into a discriminated
 * result the UI can render (field issues → `form.setError`, other codes → an `ErrorState`). No
 * server imports — this module is safe to bundle into any client component (and the plain
 * `FieldIssue` type is shared back into the server `api-handler`).
 */

import type { ApiErrorBody, ApiFailure, FieldIssue } from "@destaworks/contracts/api";

export type { ApiErrorBody, ApiFailure, FieldIssue };

/**
 * Where the browser sends a call, and whether that call has to carry the cookie explicitly.
 *
 * Callers pass `/api/...` because that is where `apps/web`'s route handlers live. `apps/api` sets
 * no global prefix, so its routes are `/candidates`, `/crm/clients`, … — the same paths the SERVER
 * half (`./server.ts`) already passes. The `/api` segment is therefore an `apps/web` routing
 * detail, and stripping it here is what makes both halves address one API, without editing the 72
 * call sites that spell it.
 *
 * With `NEXT_PUBLIC_API_URL` unset this returns the caller's URL untouched, so nothing changes
 * until the API is hosted and the variable is set.
 */
function resolveTarget(url: string): { url: string; crossOrigin: boolean } {
  const relative = { url, crossOrigin: false };
  const base = process.env.NEXT_PUBLIC_API_URL?.trim();
  if (base === undefined || base === "") return relative;
  if (url !== "/api" && !url.startsWith("/api/")) return relative;

  const path = url.slice("/api".length);
  // Better Auth is mounted INSIDE apps/web at app/api/auth/[...all] and owns its own transport;
  // sending it to apps/api would break sign-in, so it stays relative whatever the base is.
  if (/^\/auth(?:[/?#]|$)/.test(path)) return relative;

  try {
    const joined = new URL(path.replace(/^\//, ""), base.endsWith("/") ? base : `${base}/`);
    return { url: joined.toString(), crossOrigin: true };
  } catch {
    return relative;
  }
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

/** Issue `fetch(url, init)` and turn a non-OK response — or a transport failure — into an
 *  `ApiFailure` (shared by every verb below). `fetch` *rejects* rather than resolving when the
 *  network is unreachable (offline, DNS failure, connection reset) and `res.json()` throws on a
 *  non-JSON body from an edge/proxy error page; both are surfaced as `NETWORK` so callers never
 *  have to catch. A deliberate `AbortController.abort()` still rejects with `AbortError`, which
 *  is the contract effect cleanups rely on to tell "cancelled" apart from "failed". */
async function request<T>(url: string, init: RequestInit): Promise<ApiResult<T>> {
  const target = resolveTarget(url);
  try {
    // `credentials` only when the call left this origin: the default `same-origin` drops the
    // session cookie cross-origin, and setting `include` on a same-origin call changes nothing
    // except widening what a future misconfiguration would send.
    const res = await fetch(
      target.url,
      target.crossOrigin ? { ...init, credentials: "include" } : init,
    );
    if (!res.ok) return { ok: false, failure: await readFailure(res) };
    const data = (await res.json()) as T;
    return { ok: true, data };
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    return {
      ok: false,
      failure: {
        code: "NETWORK",
        message: "Couldn't reach the server. Check your connection and try again.",
        issues: [],
      },
    };
  }
}

/** A JSON body request — `Content-Type` header + serialized body (shared by POST/PATCH/PUT). */
function jsonRequestInit(method: string, body: unknown): RequestInit {
  return { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}

/** GET `url` as JSON, returning the parsed response `T` on success or an `ApiFailure`. `signal`
 *  is optional — pass an `AbortController`'s signal from an effect's cleanup to make the fetch
 *  StrictMode-safe (dev double-invokes every effect; aborting the first call's fetch avoids
 *  firing the request twice, matching React's own recommended pattern for this). */
export function getJson<T>(url: string, signal?: AbortSignal): Promise<ApiResult<T>> {
  return request<T>(url, signal ? { signal } : {});
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
