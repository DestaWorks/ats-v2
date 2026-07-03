import "server-only";
import { ZodError } from "zod";
import { AppError } from "./app-error";

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

/** A single Zod validation failure, flattened to a client-safe `{ path, message }`. */
interface FieldIssue {
  path: string;
  message: string;
}

/** JSON success helper — the counterpart to the error envelope. */
export function json<T>(data: T, status = 200): Response {
  return Response.json(data, { status });
}

/** JSON error-envelope helper. */
function errorResponse(
  code: string,
  message: string,
  status: number,
  issues?: FieldIssue[],
): Response {
  const error = issues ? { code, message, issues } : { code, message };
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
      // Unknown/unexpected error: log server-side (no request body) and return a generic 500.
      // Never surface the raw message or stack — it may contain PII/PHI.
      console.error("Unhandled API error:", err);
      return errorResponse("INTERNAL", "Internal server error", 500);
    }
  };
}
