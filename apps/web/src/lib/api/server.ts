import "server-only";
import { AppError, isAppErrorCode } from "@destaworks/integrations/http/app-error";
import { readFailure } from "./client";
import { requestContext } from "@destaworks/config/request-context";

/**
 * The SERVER half of `apps/web`'s API client — the one a Server Component uses.
 *
 * Its sibling `./client.ts` is the browser half. Two modules because they are genuinely different
 * jobs, not two ways of doing one: the browser sends a relative URL and the cookie rides along
 * automatically, while a Server Component sends an absolute URL to another host and must forward
 * the cookie by hand. They share the envelope reader, and nothing else.
 *
 * The result shape differs for the same reason. `./client.ts` RETURNS `ApiResult` because a
 * component renders the failure; this one THROWS `AppError` because a page's failure path is
 * `notFound()` and the error boundary — the same ones the in-process services already triggered,
 * so a ported page behaves identically.
 *
 * SAAS-RESTRUCTURE-PLAN 4.0 decided this (Option A) and rejected importing
 * `@destaworks/application` in a page: two paths into the same data means tenant scoping and
 * capability checks have to be proven correct in both, and under multi-tenancy a missed tenant
 * filter is a reportable breach rather than a bug. One path is one place to prove isolation.
 *
 * It THROWS `AppError` rather than returning a result, deliberately. Every page here already
 * handles the codes its services used to throw — `NOT_FOUND` into `notFound()`, everything else
 * into the error boundary — so mirroring the API's envelope back into the same exception keeps the
 * ported pages behaving identically to the in-process versions they replace.
 */

/** Server-side only. Never `NEXT_PUBLIC_`: the browser must not learn the API's address. */
const API_BASE_URL_ENV = "API_URL";

/** Join the configured base with a path, or `null` when the base is unset or unparseable. */
export function apiUrl(path: string, base: string | undefined): string | null {
  if (base === undefined || base.trim() === "") return null;
  try {
    return new URL(path.replace(/^\//, ""), base.endsWith("/") ? base : `${base}/`).toString();
  } catch {
    return null;
  }
}

/**
 * Re-throw the API's failure as the exception the page already expects.
 *
 * The envelope is parsed by `readFailure` from `./client.ts`, so both halves read a failure the
 * same way and a change to the envelope cannot be handled in one and missed in the other. The code
 * is trusted only when it is one this app declares; anything else collapses to `INTERNAL`, so a
 * proxy's error page cannot invent a code that changes how a page renders.
 */
async function throwFromResponse(res: Response): Promise<never> {
  const failure = await readFailure(res);
  throw new AppError(
    isAppErrorCode(failure.code) ? failure.code : "INTERNAL",
    failure.message,
    res.status,
  );
}

/**
 * One GET against `apps/api`, with this request's session forwarded.
 *
 * The cookie is passed through because `apps/api` authenticates the ORIGINAL user — `apps/web`
 * holds no credential of its own and must never acquire one, or it becomes a second way to reach
 * another tenant's data. `no-store` for the same reason: the response is specific to the caller's
 * session and must never be served to the next one. Caching a read that a capability gated is how
 * one user gets served another's rows.
 */
export async function apiGet<T>(path: string): Promise<T> {
  const url = apiUrl(path, process.env[API_BASE_URL_ENV]);
  if (url === null) {
    throw new AppError("INTERNAL", `The API address is not configured (${API_BASE_URL_ENV}).`);
  }

  const cookie = (await requestContext().headers()).get("cookie");

  let res: Response;
  try {
    res = await fetch(url, {
      method: "GET",
      cache: "no-store",
      headers: { accept: "application/json", ...(cookie !== null && { cookie }) },
    });
  } catch {
    throw new AppError("UPSTREAM_ERROR", "Couldn't reach the API.", 502);
  }

  if (!res.ok) return await throwFromResponse(res);
  return (await res.json()) as T;
}

/** Build a query string from defined values only, so an absent filter is absent from the URL. */
export function query(
  params: Record<string, string | number | boolean | undefined | null>,
): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    search.set(key, String(value));
  }
  const qs = search.toString();
  return qs === "" ? "" : `?${qs}`;
}
