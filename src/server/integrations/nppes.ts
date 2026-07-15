import "server-only";
import { AppError } from "@/server/http/app-error";

/**
 * Client for the CMS NPI Registry (NPPES) public API — free, unauthenticated, no key needed
 * (`https://npiregistry.cms.hhs.gov/api/`). First external-HTTP-API integration in this codebase
 * (no existing fetch/timeout wrapper to reuse — `server/ai/provider.ts` goes through the Vercel AI
 * SDK, not raw fetch). NPPES returns HTTP 200 even when a query lacks sufficient search criteria
 * (e.g. `state` alone) — the failure shows up as a body-level `Errors` array, not a status code, so
 * that has to be checked explicitly.
 */

const NPPES_BASE = "https://npiregistry.cms.hhs.gov/api/";
const TIMEOUT_MS = 8000;
/** NPPES's own per-call result cap. */
export const NPPES_RESULT_LIMIT = 50;

export interface NppesQuery {
  taxonomyDescription?: string;
  state?: string;
  city?: string;
  firstName?: string;
  lastName?: string;
}

export interface NppesAddress {
  address_purpose: string;
  city?: string;
  state?: string;
  postal_code?: string;
  telephone_number?: string;
}

export interface NppesTaxonomy {
  code: string;
  desc: string;
  state?: string;
  license?: string;
  primary: boolean;
}

export interface NppesRawResult {
  number: string;
  basic: { first_name?: string; last_name?: string; credential?: string };
  addresses: NppesAddress[];
  taxonomies: NppesTaxonomy[];
}

export interface NppesSearchResult {
  resultCount: number;
  results: NppesRawResult[];
}

function buildParams(query: NppesQuery): URLSearchParams {
  const params = new URLSearchParams({
    version: "2.1",
    limit: String(NPPES_RESULT_LIMIT),
    enumeration_type: "NPI-1",
  });
  if (query.taxonomyDescription) params.set("taxonomy_description", query.taxonomyDescription);
  if (query.state) params.set("state", query.state);
  if (query.city) params.set("city", query.city);
  if (query.firstName) params.set("first_name", query.firstName);
  if (query.lastName) params.set("last_name", query.lastName);
  return params;
}

/** Search the NPI Registry. Throws `AppError("UPSTREAM_ERROR", ...)` on any non-OK response,
 *  timeout, unparseable body, or an NPPES-reported query error (e.g. insufficient criteria). */
export async function searchNppes(query: NppesQuery): Promise<NppesSearchResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let body: unknown;
  try {
    const res = await fetch(`${NPPES_BASE}?${buildParams(query).toString()}`, {
      signal: controller.signal,
    });
    if (!res.ok) throw new AppError("UPSTREAM_ERROR", "NPPES registry is unavailable");
    body = await res.json();
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError("UPSTREAM_ERROR", "NPPES registry is unavailable");
  } finally {
    clearTimeout(timer);
  }

  if (body == null || typeof body !== "object") {
    throw new AppError("UPSTREAM_ERROR", "NPPES registry returned an unexpected response");
  }
  const parsed = body as {
    Errors?: { description?: string }[];
    result_count?: number;
    results?: NppesRawResult[];
  };
  if (parsed.Errors?.length) {
    throw new AppError(
      "UPSTREAM_ERROR",
      parsed.Errors[0]?.description ?? "NPPES rejected the search",
    );
  }
  return { resultCount: parsed.result_count ?? 0, results: parsed.results ?? [] };
}
