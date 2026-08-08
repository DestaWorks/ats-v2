import "server-only";
import { AppError } from "@/server/http/app-error";

/**
 * Client for Hunter.io's Domain Search API — Client Discovery's contact-enrichment fallback
 * when Apollo has no result for a prospect. Mirrors `apollo.ts`/`nppes.ts`'s shape exactly
 * (manual `AbortController` timeout, `AppError("UPSTREAM_ERROR")` on failure, `hunterEnabled`
 * activate-by-key gate matching `aiEnabled`/`googleEnabled`/`apolloEnabled`).
 */

const HUNTER_BASE = "https://api.hunter.io/v2";
const TIMEOUT_MS = 10_000;

export const hunterEnabled: boolean = Boolean(process.env.HUNTER_API_KEY);

export interface HunterContact {
  fullName: string;
  title: string | null;
  email: string | null;
  phone: string | null;
  linkedinUrl: string | null;
  seniority: string | null;
}

interface HunterEmailRaw {
  first_name?: string;
  last_name?: string;
  position?: string;
  value?: string;
  phone_number?: string;
  linkedin?: string;
  seniority?: string;
}

/**
 * Find contacts at a domain (Domain Search). Throws `AppError("FEATURE_DISABLED", ...)` if no
 * `HUNTER_API_KEY` is configured, or `AppError("UPSTREAM_ERROR", ...)` on any non-OK response,
 * timeout, or unparseable body.
 */
export async function findHunterContacts(params: { domain: string }): Promise<HunterContact[]> {
  if (!hunterEnabled) {
    throw new AppError("FEATURE_DISABLED", "Hunter.io contact enrichment is not configured");
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let body: unknown;
  try {
    const url = new URL(`${HUNTER_BASE}/domain-search`);
    url.searchParams.set("domain", params.domain);
    url.searchParams.set("api_key", process.env.HUNTER_API_KEY!);
    url.searchParams.set("limit", "10");
    const res = await fetch(url.toString(), { signal: controller.signal });
    if (!res.ok) throw new AppError("UPSTREAM_ERROR", "Hunter.io is unavailable");
    body = await res.json();
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError("UPSTREAM_ERROR", "Hunter.io is unavailable");
  } finally {
    clearTimeout(timer);
  }

  if (body == null || typeof body !== "object") {
    throw new AppError("UPSTREAM_ERROR", "Hunter.io returned an unexpected response");
  }
  const parsed = body as { data?: { emails?: HunterEmailRaw[] } };
  return (parsed.data?.emails ?? []).map((e) => ({
    fullName: [e.first_name, e.last_name].filter(Boolean).join(" ") || (e.value ?? ""),
    title: e.position ?? null,
    email: e.value ?? null,
    phone: e.phone_number ?? null,
    linkedinUrl: e.linkedin ?? null,
    seniority: e.seniority ?? null,
  }));
}
