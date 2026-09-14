import {
  RESERVED_TENANT_SLUGS,
  TENANT_PATH_PREFIX,
  isTenantSlug,
  normaliseTenantSlug,
} from "@destaworks/domain/constants";

/**
 * Reading the tenant CLAIM off a request (SAAS-RESTRUCTURE-PLAN 6.5, first bullet).
 *
 * A claim is an assertion, not an authorization. Nothing in this file touches the database, and
 * nothing in it grants anything: it answers "which tenant is this request asking for", and
 * `./tenant-context.ts` then answers "may they". Splitting it this way is what makes the
 * precedence rules below testable as pure data, and what keeps the verification step impossible to
 * skip — a `TenantClaim` is useless to a repository, since only a `TenantContext` opens the seam.
 *
 * ── PRECEDENCE, and why ────────────────────────────────────────────────────────────────────────
 *
 *   1. PATH SEGMENT  `/t/<slug>/…`
 *   2. SUBDOMAIN     `<slug>.example.com`
 *   3. COOKIE        `dw_tenant=<slug>`
 *
 * The order runs from most explicit to least. The path and the subdomain are both part of what the
 * user actually asked for — they are visible in the URL bar, they survive being copied into a
 * message, and they are what a bookmark or a deep link from an email carries. The cookie is
 * ambient: it records where the user was last, not where they are going.
 *
 * So the cookie must lose. A member of two tenants who follows a link into tenant B, while their
 * cookie still says tenant A, must land in B — not be silently redirected into A, and above all
 * not act in A while the URL claims B. That last case is the dangerous one: it puts a mutation in
 * the wrong tenant while every visible cue says otherwise.
 *
 * Path beats subdomain because the path is narrower. A subdomain is chosen by whatever DNS the
 * request arrived on and applies to a whole host; a path is chosen per request. When both are
 * present and disagree — a proxied or preview deployment serving `/t/acme` under `beta.…` — the
 * request-level statement is the one the user made.
 *
 * There is deliberately NO header source. A header is not visible to the user, so it can never be
 * "what they asked for"; and any header we honoured would become a second resolution path with a
 * different trust story to reason about. One path is the requirement.
 *
 * ── WHY PRECEDENCE IS NOT A SECURITY CONTROL ───────────────────────────────────────────────────
 *
 * Every source in the list is equally forgeable. Precedence exists to make the app predictable,
 * not safe: safety comes from `resolveTenantContext` matching whichever claim wins against an
 * ACTIVE membership before it becomes a context, and refusing outright if it cannot. Ranking the
 * sources by trust would be the wrong model — a cookie is not "more trusted" than a URL, both are
 * simply unverified until they are verified.
 */

/**
 * Which part of the request the claim came from. Carried through so a denial can say where.
 *
 * `body` is never produced by `readTenantClaim` — it names the one non-URL source, the explicit
 * "switch to this workspace" request. It is in the union rather than in a parallel type so that
 * the switch goes through `resolveTenantContext` like every other claim, instead of acquiring its
 * own verification and, in time, its own bug.
 */
export type TenantClaimSource = "path" | "subdomain" | "cookie" | "body";

/** A tenant the request asked for, and nothing more. Never sufficient to reach any data. */
export interface TenantClaim {
  readonly source: TenantClaimSource;
  /** Normalised slug. Syntactically valid and not reserved; existence is not implied. */
  readonly slug: string;
}

/**
 * The request facts a claim can be read from. All optional — a request may carry none of them, and
 * "no claim" is a normal outcome, not an error.
 *
 * Supplied by the transport (a Nest guard, a Next route) rather than pulled from a request-context
 * port, because the port intentionally exposes only headers and cookies: the path is not a header,
 * and widening a settled framework-free port for one caller would be the wrong trade.
 */
export interface TenantClaimInput {
  /** The `Host` header, with or without a port. */
  readonly host?: string | undefined;
  /** The server-relative target, e.g. `/t/acme/pipeline?q=x`. Query and fragment are ignored. */
  readonly path?: string | undefined;
  /** The already-decoded `dw_tenant` cookie value. */
  readonly cookie?: string | undefined;
}

/** `acme.localhost` has only two labels but is a real dev subdomain, so `localhost` is an apex. */
const APEX_LABELS: readonly string[] = ["localhost"];

/** Normalise, then accept only a syntactically valid, non-reserved slug. */
function toSlug(raw: string | undefined): string | null {
  if (raw === undefined) return null;
  const slug = normaliseTenantSlug(raw);
  return isTenantSlug(slug) ? slug : null;
}

/** `/t/<slug>/rest` → `<slug>`. Any other shape yields nothing. */
function fromPath(path: string | undefined): string | null {
  if (path === undefined) return null;
  const withoutQuery = path.split(/[?#]/, 1)[0] ?? "";
  const segments = withoutQuery.split("/").filter(Boolean);
  if (segments[0] !== TENANT_PATH_PREFIX) return null;
  return toSlug(segments[1]);
}

/**
 * `<slug>.example.com` → `<slug>`.
 *
 * Requires a real parent domain, so a bare apex (`example.com`, `localhost`) claims nothing. An IP
 * literal has no subdomain by definition and is rejected by the slug grammar anyway — `127` is a
 * valid label but `127.0.0.1` yields `127`, so the apex-label check below is what keeps a
 * loopback host from being read as a tenant named `127`.
 */
function fromHost(host: string | undefined): string | null {
  if (host === undefined) return null;
  const hostname = host.split(":", 1)[0]?.trim().toLowerCase() ?? "";
  if (hostname === "") return null;
  if (/^[\d.]+$/.test(hostname) || hostname.includes("[")) return null;

  const labels = hostname.split(".").filter(Boolean);
  const last = labels[labels.length - 1];
  const minimumLabels = last !== undefined && APEX_LABELS.includes(last) ? 2 : 3;
  if (labels.length < minimumLabels) return null;

  return toSlug(labels[0]);
}

/**
 * The one place a request's tenant claim is read. Returns the highest-precedence claim present, or
 * `null` when the request names no tenant at all.
 *
 * A malformed or reserved value at one level does not fall through to the next as if it were
 * absent — it is simply not a claim, and the next source is consulted. That is intentional: a typo
 * in a subdomain should land the user on "pick a workspace", not quietly in whatever their cookie
 * remembers.
 */
export function readTenantClaim(input: TenantClaimInput): TenantClaim | null {
  const path = fromPath(input.path);
  if (path !== null) return { source: "path", slug: path };

  const subdomain = fromHost(input.host);
  if (subdomain !== null) return { source: "subdomain", slug: subdomain };

  const cookie = toSlug(input.cookie);
  if (cookie !== null) return { source: "cookie", slug: cookie };

  return null;
}

/** Re-exported so a caller validating a slug from a request BODY uses the same rules as the URL. */
export { RESERVED_TENANT_SLUGS, isTenantSlug, normaliseTenantSlug };
