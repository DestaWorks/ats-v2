import "server-only";
import { randomUUID } from "node:crypto";
import { ZodError } from "zod";
import { AppError } from "./app-error";
import * as Sentry from "@sentry/nextjs";
import { logger } from "@destaworks/config/logger";
import { runWithLogContext } from "@destaworks/config/logger/request-context";
import type { FieldIssue } from "@destaworks/contracts/api";

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
 * Every invocation runs inside a log context carrying a fresh `requestId`; that same id is what
 * an unexpected 500 returns to the client as `error.ref`.
 */

/** The shape of a route function `apiHandler` wraps. `ctx` is Next's optional route context. */
type RouteFn<Ctx> = (req: Request, ctx: Ctx) => Promise<Response> | Response;

/** Path only — the query string can carry a typed-in candidate name, so it never reaches a log. */
function safePathname(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return "unknown";
  }
}

/** JSON success helper — the counterpart to the error envelope. */
export function json<T>(data: T, status = 200): Response {
  return Response.json(data, { status });
}

/** JSON error-envelope helper. `ref` (a correlation id) is attached only on unexpected 500s. */
function errorResponse(
  code: string,
  message: string,
  status: number,
  issues?: FieldIssue[],
  ref?: string,
): Response {
  const error: Record<string, unknown> = { code, message };
  if (issues) error.issues = issues;
  if (ref) error.ref = ref;
  return Response.json({ error }, { status });
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
      const route = safePathname(req.url);
      try {
        const res = await fn(req, ctx);
        logger.info("api.request.completed", {
          method: req.method,
          route,
          status: res.status,
          durationMs: Date.now() - startedAt,
        });
        return res;
      } catch (err) {
        const durationMs = Date.now() - startedAt;
        if (err instanceof AppError) {
          logger.debug("api.request.rejected", {
            method: req.method,
            route,
            status: err.status,
            errorCode: err.code,
            durationMs,
          });
          return errorResponse(err.code, err.message, err.status);
        }
        if (err instanceof ZodError) {
          const issues: FieldIssue[] = err.issues.map((issue) => ({
            path: issue.path.join("."),
            message: issue.message,
          }));
          logger.debug("api.request.invalid", {
            method: req.method,
            route,
            status: 422,
            issueCount: issues.length,
            durationMs,
          });
          return errorResponse("BAD_REQUEST", "Validation failed", 422, issues);
        }
        // Unknown/unexpected error. NEVER log the raw error/message/stack — Prisma embeds the offending
        // field VALUES (PII/PHI) in its messages. Log only the error name + any code; the line carries
        // this request's `requestId`, which is also returned to the client as `error.ref` so a report
        // can be traced to this log line WITHOUT exposing the underlying error.
        logger.error("api.request.failed", {
          method: req.method,
          route,
          status: 500,
          errorType: (err as { name?: string })?.name ?? "Error",
          errorCode: (err as { code?: string })?.code,
          durationMs,
        });
        // The log line carries no error text by design, so Sentry is the ONLY place the actual
        // exception is recoverable. Tagged with the same requestId the client receives as
        // `error.ref`, so a user's report resolves to one event. Prisma messages are redacted in
        // `scrubEvent` — they embed field values.
        Sentry.captureException(err, { tags: { requestId } });
        return errorResponse("INTERNAL", "Internal server error", 500, undefined, requestId);
      }
    });
  };
}
