/** Request headers as Node hands them over — repeated values arrive as an array. */
export type RequestHeaders = Readonly<Record<string, string | string[] | undefined>>;

const FORWARDED_HOST = "x-forwarded-host";
const HOST = "host";

/**
 * HOW THE TENANT REACHES A PUBLIC ENDPOINT, AND WHY IT IS NOT A CLAIM THE CALLER CAN MAKE UP
 *
 * The two request-access forms are unauthenticated, so there is no session to carry a tenant and
 * no membership to verify one against. The workspace is whichever one's public URL the visitor
 * opened — `<slug>.destaworks.com/request-access`. `apps/web` renders that form and then calls
 * this API server-to-server, so the API's own `Host` is the API's address; the host the visitor
 * actually used is forwarded as `X-Forwarded-Host` and read here.
 *
 * It stays a CLAIM, exactly like the `Host` a browser sends `TenantGuard`. `publicTenantService`
 * runs it through the same `readTenantClaim` grammar every other entry point uses, looks the slug
 * up, and refuses unless the workspace exists and `tenantIsUsable` — so an unknown or suspended
 * one is a refusal rather than a scope. Forging the header buys nothing: the value it names is a
 * public hostname, and opening that same public form in a browser is the sanctioned way to file a
 * request against that workspace. The endpoint grants no more than the front door already does —
 * a pending row an operator must approve before any account exists.
 *
 * The tenant is deliberately NOT taken from the body. There it would be a field of the form, and a
 * request filed at one workspace's form could land in another's while every visible cue said
 * otherwise — the mismatch `packages/auth/src/tenant-claim.ts` calls the dangerous one. Both
 * request schemas are `.strict()`, so a body naming a tenant is a 422 rather than a value ignored.
 */
export function publicRequestHost(headers: RequestHeaders): string | undefined {
  return firstHost(headers[FORWARDED_HOST]) ?? firstHost(headers[HOST]);
}

/** First entry of a repeated or comma-joined header — the original client-facing host. */
function firstHost(value: string | string[] | undefined): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  const host = raw?.split(",", 1)[0]?.trim();
  return host === undefined || host === "" ? undefined : host;
}
