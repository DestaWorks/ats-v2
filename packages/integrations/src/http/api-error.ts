import { ZodError } from "zod";
import type { FieldIssue } from "@destaworks/contracts/api";
import type { LogFields, LogLevel } from "@destaworks/config/logger";
import { AppError, type AppErrorCode } from "./app-error";

/**
 * The framework-free half of the API error contract: how a thrown value becomes a status, an
 * `{ error: { code, message, issues?, ref? } }` envelope, and a PII-free log line.
 *
 * It lives here — not in a route wrapper — because two frameworks now serve the same contract:
 * `apiHandler` (Next.js App Router) and the NestJS exception/logging classes in `apps/api`. Both
 * import this module, so the envelope, the code union, the messages and the log vocabulary have
 * exactly one definition and cannot drift apart during the Phase 4 cutover.
 */

/** Status, code and message for a request whose input failed validation. */
export const VALIDATION_ERROR = {
  status: 422,
  code: "BAD_REQUEST",
  message: "Validation failed",
} as const satisfies { status: number; code: AppErrorCode; message: string };

/** Status, code and message for an unexpected error. The message is fixed and says nothing. */
export const INTERNAL_ERROR = {
  status: 500,
  code: "INTERNAL",
  message: "Internal server error",
} as const satisfies { status: number; code: AppErrorCode; message: string };

/** The structured-log event name per request outcome. One vocabulary across both frameworks. */
export const API_LOG_EVENTS = {
  completed: "api.request.completed",
  rejected: "api.request.rejected",
  invalid: "api.request.invalid",
  failed: "api.request.failed",
} as const;

/** A thrown value reduced to what may be shown, logged and reported — nothing else survives. */
export type ClassifiedError =
  | { kind: "app"; status: number; code: AppErrorCode; message: string }
  | {
      kind: "validation";
      status: typeof VALIDATION_ERROR.status;
      code: typeof VALIDATION_ERROR.code;
      message: string;
      issues: FieldIssue[];
    }
  | {
      kind: "unexpected";
      status: typeof INTERNAL_ERROR.status;
      code: typeof INTERNAL_ERROR.code;
      message: string;
      errorType: string;
      errorCode: string | undefined;
    };

/** The wire shape every failing endpoint returns. */
export interface ErrorEnvelope {
  error: { code: AppErrorCode; message: string; issues?: FieldIssue[]; ref?: string };
}

/** The per-request facts a log line carries alongside the outcome. */
export interface ApiRequestLogContext {
  method: string;
  route: string;
  durationMs: number;
}

/** A log line ready to emit: which level, which event, which (PII-free) fields. */
export interface ApiLogEntry {
  level: LogLevel;
  event: string;
  fields: LogFields;
}

/** A string-valued own/inherited property of a thrown value, without asserting its shape. */
function readString(value: unknown, key: string): string | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const found: unknown = Reflect.get(value, key);
  return typeof found === "string" ? found : undefined;
}

/**
 * Reduce a thrown value to the three outcomes the API contract knows. Anything that is not a
 * typed `AppError` or a `ZodError` is `unexpected`, and its message is discarded here rather
 * than downstream — Prisma embeds the offending field VALUES in its messages, so a leak from
 * this function is a PII/PHI disclosure.
 */
/**
 * A framework-raised HTTP failure — an unmatched route, a malformed body the server rejected
 * before a handler ran. These carry a real status that must survive, but their body is the
 * framework's, so only the status and a fixed client-safe message cross the boundary.
 *
 * Mapped onto the existing code union rather than a new one: the wire contract has exactly the
 * codes in `AppErrorCode`, and a client branching on `code` must not meet a new value because the
 * server changed framework.
 */
export function frameworkError(status: number): ClassifiedError {
  const code: AppErrorCode =
    status === 401
      ? "UNAUTHORIZED"
      : status === 403
        ? "FORBIDDEN"
        : status === 404
          ? "NOT_FOUND"
          : status === 409
            ? "CONFLICT"
            : status === 429
              ? "RATE_LIMITED"
              : status >= 500
                ? "INTERNAL"
                : "BAD_REQUEST";
  return { kind: "app", status, code, message: FRAMEWORK_MESSAGES[code] };
}

/** Client-safe reason phrases. Never the framework's own body, which can echo the request. */
const FRAMEWORK_MESSAGES: Record<AppErrorCode, string> = {
  UNAUTHORIZED: "Sign in required",
  FORBIDDEN: "You do not have permission to do that",
  NOT_FOUND: "Not found",
  CONFLICT: "That conflicts with the current state",
  RATE_LIMITED: "Too many requests",
  BAD_REQUEST: "Bad request",
  INTERNAL: INTERNAL_ERROR.message,
  STAGE_BLOCKED: "Bad request",
  FEATURE_DISABLED: "Bad request",
  UPSTREAM_ERROR: "Bad request",
  EXTRACTION_FAILED: "Bad request",
};

export function classifyError(err: unknown): ClassifiedError {
  if (err instanceof AppError) {
    return { kind: "app", status: err.status, code: err.code, message: err.message };
  }
  if (err instanceof ZodError) {
    return {
      kind: "validation",
      ...VALIDATION_ERROR,
      issues: err.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
    };
  }
  return {
    kind: "unexpected",
    ...INTERNAL_ERROR,
    errorType: readString(err, "name") ?? "Error",
    errorCode: readString(err, "code"),
  };
}

/**
 * Build the response body. `requestId` is attached as `ref` only on an unexpected error: that is
 * the one response carrying no usable detail, so the id is what ties a user's report to the single
 * log line describing it.
 */
export function errorEnvelope(classified: ClassifiedError, requestId?: string): ErrorEnvelope {
  const error: ErrorEnvelope["error"] = { code: classified.code, message: classified.message };
  if (classified.kind === "validation") error.issues = classified.issues;
  if (classified.kind === "unexpected" && requestId !== undefined) error.ref = requestId;
  return { error };
}

/** The log line for a request that produced a response. */
export function successLogEntry(status: number, context: ApiRequestLogContext): ApiLogEntry {
  return {
    level: "info",
    event: API_LOG_EVENTS.completed,
    fields: {
      method: context.method,
      route: context.route,
      status,
      durationMs: context.durationMs,
    },
  };
}

/**
 * The log line for a request that threw. Expected outcomes are `debug` — a rejected `AppError` is
 * control flow, not an incident. Only the unexpected branch is `error`, and it carries the error's
 * TYPE and code, never its message.
 */
export function errorLogEntry(
  classified: ClassifiedError,
  context: ApiRequestLogContext,
): ApiLogEntry {
  const head = { method: context.method, route: context.route, status: classified.status };
  const { durationMs } = context;
  switch (classified.kind) {
    case "app":
      return {
        level: "debug",
        event: API_LOG_EVENTS.rejected,
        fields: { ...head, errorCode: classified.code, durationMs },
      };
    case "validation":
      return {
        level: "debug",
        event: API_LOG_EVENTS.invalid,
        fields: { ...head, issueCount: classified.issues.length, durationMs },
      };
    case "unexpected":
      return {
        level: "error",
        event: API_LOG_EVENTS.failed,
        fields: {
          ...head,
          errorType: classified.errorType,
          errorCode: classified.errorCode,
          durationMs,
        },
      };
  }
}
