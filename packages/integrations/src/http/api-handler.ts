import { randomUUID } from "node:crypto";
import * as Sentry from "@sentry/nextjs";
import { logger } from "@destaworks/config/logger";
import { runWithLogContext } from "@destaworks/config/logger/request-context";
import { classifyError, errorEnvelope, errorLogEntry, successLogEntry } from "./api-error";
import { safePathname } from "./safe-pathname";

/**
 * Route wrapper for Next.js App Router handlers. Centralizes error mapping so every
 * route returns a uniform `{ error: { code, message } }` envelope with the right status,
 * and — critically for a PII/PHI system — never leaks raw error messages, stacks, or
 * request bodies to the client (see CLAUDE.md ground rule 1).
 *
 * - `AppError`   → `err.status` + `{ error: { code, message } }`.
 * - `ZodError`   → 422 + `{ error: { code: "BAD_REQUEST", message, issues } }` (issues are
 *                  validation messages only — safe to expose).
 * - anything else → 500 + a fixed generic message (only the error's TYPE is logged
 *                  server-side, without any request body).
 *
 * The mapping itself lives in `./api-error`, framework-free, so the NestJS filter and
 * interceptors in `apps/api` serve the identical contract during the Phase 4 cutover.
 *
 * Every invocation runs inside a log context carrying a fresh `requestId`; that same id is what
 * an unexpected 500 returns to the client as `error.ref`.
 */

/** The shape of a route function `apiHandler` wraps. `ctx` is Next's optional route context. */
type RouteFn<Ctx> = (req: Request, ctx: Ctx) => Promise<Response> | Response;

/** JSON success helper — the counterpart to the error envelope. */
export function json<T>(data: T, status = 200): Response {
  return Response.json(data, { status });
}

/**
 * Wrap a route function into a Next.js App Router handler with centralized error mapping.
 * Accepts (and forwards) Next's optional route-context argument so it works for dynamic routes.
 */
export function apiHandler<Ctx = unknown>(fn: RouteFn<Ctx>): RouteFn<Ctx> {
  return async (req: Request, ctx: Ctx): Promise<Response> => {
    const requestId = randomUUID();
    return runWithLogContext({ requestId }, async () => {
      const startedAt = Date.now();
      const method = req.method;
      const route = safePathname(req.url);
      try {
        const res = await fn(req, ctx);
        const entry = successLogEntry(res.status, {
          method,
          route,
          durationMs: Date.now() - startedAt,
        });
        logger[entry.level](entry.event, entry.fields);
        return res;
      } catch (err) {
        const classified = classifyError(err);
        const entry = errorLogEntry(classified, {
          method,
          route,
          durationMs: Date.now() - startedAt,
        });
        // The unexpected branch deliberately logs no error text — `classifyError` already dropped
        // it, because Prisma embeds the offending field VALUES in its messages.
        logger[entry.level](entry.event, entry.fields);
        if (classified.kind === "unexpected") {
          // The log line carries no error text by design, so Sentry is the ONLY place the actual
          // exception is recoverable. Tagged with the same requestId the client receives as
          // `error.ref`, so a user's report resolves to one event. Prisma messages are redacted in
          // `scrubEvent` — they embed field values.
          Sentry.captureException(err, { tags: { requestId } });
        }
        return Response.json(errorEnvelope(classified, requestId), { status: classified.status });
      }
    });
  };
}
