import { healthService, type HealthCheckResult } from "@destaworks/application/health.service";

/** Response body of `GET /api/health` — deliberately not the usual error envelope. */
export type GetHealthResponse = HealthCheckResult;

/**
 * GET /api/health — public, unauthenticated (an uptime monitor can't sign in). Point Better
 * Stack (or any uptime service) at this instead of `/`: it actually proves Postgres is
 * reachable, not just that the Next.js process is up. Returns a minimal, deliberately
 * non-standard body (not this app's usual `{error:{code,message}}` envelope) — a health check's
 * consumer is a monitoring tool, not this app's own client code, and should never see anything
 * beyond "up or down" (no stack trace, no connection string, no PII surface at all).
 *
 * `force-dynamic`: this route reads no cookies/headers, so without this Next.js would treat it
 * as a static route and cache the response at build time — the opposite of what a liveness check
 * needs, since it would then report "ok" forever regardless of the database's real state.
 */
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const result: GetHealthResponse = await healthService.check();
  return Response.json(result, { status: result.ok ? 200 : 503 });
}
