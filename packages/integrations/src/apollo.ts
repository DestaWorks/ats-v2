import { AppError } from "./http/app-error";

/**
 * Client for Apollo.io's People Search / Organization Enrichment API — Client Discovery's
 * primary contact-enrichment provider. Mirrors `nppes.ts`'s shape (manual `AbortController`
 * timeout, `AppError("UPSTREAM_ERROR")` on failure) but needs an API key, unlike NPPES.
 * `apolloEnabled` follows the same "activate-by-key" convention as `aiEnabled`
 * (`server/ai/config.ts`) and `googleEnabled` (`server/auth/auth.ts`) — the feature degrades to a
 * clear "not configured" error rather than crashing when `APOLLO_API_KEY` is unset, so Client
 * Discovery's NPPES-search + manual-pipeline core works immediately without it.
 */

const APOLLO_BASE = "https://api.apollo.io/v1";
const TIMEOUT_MS = 10_000;

const apolloApiKey = process.env.APOLLO_API_KEY;

export const apolloEnabled: boolean = Boolean(apolloApiKey);

export interface ApolloContact {
  fullName: string;
  title: string | null;
  email: string | null;
  phone: string | null;
  linkedinUrl: string | null;
  seniority: string | null;
}

interface ApolloPersonRaw {
  name?: string;
  title?: string;
  email?: string;
  seniority?: string;
  linkedin_url?: string;
  phone_numbers?: { sanitized_number?: string }[];
}

/**
 * Find contacts at an organization by domain/name (People Search, filtered to one org).
 * Throws `AppError("FEATURE_DISABLED", ...)` if no `APOLLO_API_KEY` is configured, or
 * `AppError("UPSTREAM_ERROR", ...)` on any non-OK response, timeout, or unparseable body.
 */
export async function findApolloContacts(params: {
  organizationName: string;
  domain?: string;
}): Promise<ApolloContact[]> {
  if (!apolloApiKey) {
    throw new AppError("FEATURE_DISABLED", "Apollo contact enrichment is not configured");
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let body: unknown;
  try {
    const res = await fetch(`${APOLLO_BASE}/mixed_people/search`, {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/json", "X-Api-Key": apolloApiKey },
      body: JSON.stringify({
        q_organization_name: params.organizationName,
        organization_domains: params.domain ? [params.domain] : undefined,
        per_page: 10,
      }),
    });
    if (!res.ok) throw new AppError("UPSTREAM_ERROR", "Apollo is unavailable");
    body = await res.json();
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError("UPSTREAM_ERROR", "Apollo is unavailable");
  } finally {
    clearTimeout(timer);
  }

  if (body == null || typeof body !== "object") {
    throw new AppError("UPSTREAM_ERROR", "Apollo returned an unexpected response");
  }
  const parsed = body as { people?: ApolloPersonRaw[] };
  return (parsed.people ?? []).map((p) => ({
    fullName: p.name ?? "",
    title: p.title ?? null,
    email: p.email ?? null,
    phone: p.phone_numbers?.[0]?.sanitized_number ?? null,
    linkedinUrl: p.linkedin_url ?? null,
    seniority: p.seniority ?? null,
  }));
}
