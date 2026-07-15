export type AppErrorCode =
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "BAD_REQUEST"
  | "CONFLICT"
  | "STAGE_BLOCKED"
  | "FEATURE_DISABLED"
  | "RATE_LIMITED"
  | "EXTRACTION_FAILED"
  | "UPSTREAM_ERROR"
  | "INTERNAL";

const DEFAULT_STATUS: Record<AppErrorCode, number> = {
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  BAD_REQUEST: 400,
  CONFLICT: 409,
  STAGE_BLOCKED: 422,
  // Wave 1.2 résumé extraction: feature not configured (no ANTHROPIC_API_KEY),
  // upstream rate limit, and a failed/refused/empty Claude extraction.
  FEATURE_DISABLED: 503,
  RATE_LIMITED: 429,
  EXTRACTION_FAILED: 502,
  // Wave 2.7 Discover: a third-party HTTP call (NPPES, or any future external integration)
  // failed, timed out, or returned an unparseable body — generic, not scoped to one provider.
  UPSTREAM_ERROR: 502,
  INTERNAL: 500,
};

/**
 * Typed application error. Services throw these; the API handler maps them to a JSON
 * response with the right HTTP status (`server/http` — full handler lands in Wave 0.4).
 */
export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly status: number;

  constructor(code: AppErrorCode, message: string, status?: number) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.status = status ?? DEFAULT_STATUS[code];
  }
}
