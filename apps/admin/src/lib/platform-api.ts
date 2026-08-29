import type { ApiErrorBody, ApiFailure } from "@destaworks/contracts/api";
import type {
  GetPlatformTenantResponse,
  GetPlatformTenantsResponse,
} from "@destaworks/contracts/validation/tenant";
import { requestContext } from "@destaworks/config/request-context";

/**
 * The console's only way to reach data: HTTP to `apps/api`.
 *
 * The dependency law gives `apps/admin` no `@destaworks/db` and no `@destaworks/application`
 * (scripts/check-architecture.mjs), so there is no in-process read path to fall back to and no
 * ratchet to grow. Every response type comes from `@destaworks/contracts`, so an endpoint that
 * changes shape breaks this file at compile time rather than at render time.
 */

/** Server-side only. Never `NEXT_PUBLIC_` — the browser must not learn the API's address. */
const API_BASE_URL_ENV = "PLATFORM_API_URL";

export type PlatformApiResult<T> =
  { readonly ok: true; readonly data: T } | { readonly ok: false; readonly failure: ApiFailure };

const CONFIG_FAILURE: ApiFailure = {
  code: "MISCONFIGURED",
  message: `The platform API address is not configured (${API_BASE_URL_ENV}).`,
  issues: [],
};

const NETWORK_FAILURE: ApiFailure = {
  code: "NETWORK",
  message: "Couldn't reach the platform API.",
  issues: [],
};

/** Join the configured base with a path, or `null` when the base is unset or unparseable. */
export function platformApiUrl(path: string, base: string | undefined): string | null {
  if (base === undefined || base.trim() === "") return null;
  try {
    return new URL(path.replace(/^\//, ""), base.endsWith("/") ? base : `${base}/`).toString();
  } catch {
    return null;
  }
}

/**
 * Turn a non-OK response into a failure. The API's own envelope is trusted for `code` and
 * `message` because it is built to be safe to show (an unexpected error is already reduced to
 * `INTERNAL` plus a `ref` there); anything else collapses to a generic message rather than
 * surfacing a proxy's error page.
 */
export async function readFailure(res: Response): Promise<ApiFailure> {
  const body = (await res.json().catch(() => ({}))) as ApiErrorBody;
  return {
    code: body.error?.code ?? "UNKNOWN",
    message: body.error?.message ?? "The platform API returned an error.",
    issues: body.error?.issues ?? [],
  };
}

/**
 * A GET against the platform API, with this request's session forwarded.
 *
 * The cookie header is passed through because `apps/api` authenticates the ORIGINAL operator —
 * the console holds no credential of its own and must never acquire one, or it would become a
 * second way to reach another tenant's data. `no-store` for the same reason: the response is
 * specific to the caller's session and must never be served to the next one.
 */
async function platformGet<T>(path: string): Promise<PlatformApiResult<T>> {
  const url = platformApiUrl(path, process.env[API_BASE_URL_ENV]);
  if (url === null) return { ok: false, failure: CONFIG_FAILURE };

  const cookie = (await requestContext().headers()).get("cookie");

  try {
    const res = await fetch(url, {
      method: "GET",
      cache: "no-store",
      headers: {
        accept: "application/json",
        ...(cookie !== null && { cookie }),
      },
    });
    if (!res.ok) return { ok: false, failure: await readFailure(res) };
    return { ok: true, data: (await res.json()) as T };
  } catch {
    return { ok: false, failure: NETWORK_FAILURE };
  }
}

/** `GET /platform/tenants` — the tenant registry. Operational metadata only. */
export function listPlatformTenants(): Promise<PlatformApiResult<GetPlatformTenantsResponse>> {
  return platformGet<GetPlatformTenantsResponse>("/platform/tenants");
}

/** `GET /platform/tenants/:slug` — one workspace, read from outside it. Audited by the API. */
export function readPlatformTenant(
  slug: string,
): Promise<PlatformApiResult<GetPlatformTenantResponse>> {
  return platformGet<GetPlatformTenantResponse>(`/platform/tenants/${encodeURIComponent(slug)}`);
}
