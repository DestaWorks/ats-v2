export type AppErrorCode =
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "BAD_REQUEST"
  | "CONFLICT"
  | "STAGE_BLOCKED"
  | "INTERNAL";

const DEFAULT_STATUS: Record<AppErrorCode, number> = {
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  BAD_REQUEST: 400,
  CONFLICT: 409,
  STAGE_BLOCKED: 422,
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
