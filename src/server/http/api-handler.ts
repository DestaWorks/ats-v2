import "server-only";
import { randomUUID } from "node:crypto";
import { ZodError } from "zod";
import { AppError } from "./app-error";
import type { FieldIssue } from "@/lib/api/client";

/**
 * Route wrapper for Next.js App Router handlers. Centralizes error mapping so every
 * route returns a uniform `{ error: { code, message } }` envelope with the right status,
 * and — critically for a PII/PHI system — never leaks raw error messages, stacks, or
 * request bodies to the client (see CLAUDE.md ground rule 1).
 *
 * - `AppError`   → `err.status` + `{ error: { code, message } }`.
 * - `ZodError`   → 422 + `{ error: { code: "BAD_REQUEST", message, issues } }` (issues are
 *                  validation messages only — safe to expose).
 * - anything else → 500 + a fixed generic message (the real error is `console.error`'d
 *                  server-side, without any request body).
 */

/** The shape of a route function `apiHandler` wraps. `ctx` is Next's optional route context. */
type RouteFn<Ctx> = (req: Request, ctx: Ctx) => Promise<Response> | Response;

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
    try {
      return await fn(req, ctx);
    } catch (err) {
      if (err instanceof AppError) {
        return errorResponse(err.code, err.message, err.status);
      }
      if (err instanceof ZodError) {
        const issues: FieldIssue[] = err.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        }));
        return errorResponse("BAD_REQUEST", "Validation failed", 422, issues);
      }
      // Unknown/unexpected error. NEVER log the raw error/message/stack — Prisma embeds the offending
      // field VALUES (PII/PHI) in its messages. Log only the error name + any code, tagged with a
      // correlation id that we also return to the client as `error.ref` so a report can be traced to
      // this log line WITHOUT exposing the underlying error.
      const ref = randomUUID();
      const name = (err as { name?: string })?.name ?? "Error";
      const code = (err as { code?: string })?.code;
      console.error(`Unhandled API error [ref=${ref}] name=${name}${code ? ` code=${code}` : ""}`);
      return errorResponse("INTERNAL", "Internal server error", 500, undefined, ref);
    }
  };
}
