import { AppError, type AppErrorCode } from "@destaworks/integrations/http/app-error";

/**
 * Better Auth raises its own error class, which `classifyError` cannot see — `integrations` may not
 * import `auth` — so every `auth.api.*` failure reached the client as an opaque 500 plus a Sentry
 * event, including ordinary input like a taken email. Detected structurally rather than by
 * `instanceof`, because the class is not on Better Auth's public surface.
 */
interface AuthApiErrorShape {
  statusCode: number;
  body?: { code?: string; message?: string };
}

const BY_STATUS: Record<number, AppErrorCode> = {
  400: "BAD_REQUEST",
  401: "UNAUTHORIZED",
  403: "FORBIDDEN",
  404: "NOT_FOUND",
  409: "CONFLICT",
  422: "CONFLICT",
  429: "RATE_LIMITED",
};

/** Our own wording, never the upstream message — that can echo the address or password it rejected. */
const MESSAGE: Partial<Record<AppErrorCode, string>> = {
  BAD_REQUEST: "That request was not valid.",
  UNAUTHORIZED: "Those credentials were not accepted.",
  FORBIDDEN: "You don't have permission to do that.",
  NOT_FOUND: "No such account.",
  CONFLICT: "An account with this email already exists.",
  RATE_LIMITED: "Too many attempts — please wait and try again.",
};

function asAuthApiError(err: unknown): AuthApiErrorShape | null {
  if (typeof err !== "object" || err === null) return null;
  const candidate = err as Partial<AuthApiErrorShape>;
  if (typeof candidate.statusCode !== "number") return null;
  return candidate as AuthApiErrorShape;
}

/**
 * Run one `auth.api.*` call, translating its failures into `AppError` so the shared envelope and
 * status mapping apply. Anything unrecognised is rethrown untouched — an unexpected fault must stay
 * a 500 with a Sentry event rather than being dressed up as a client error.
 */
export async function callAuthApi<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (err) {
    const apiError = asAuthApiError(err);
    if (apiError === null) throw err;

    const code = BY_STATUS[apiError.statusCode];
    if (code === undefined) throw err;

    throw new AppError(code, MESSAGE[code] ?? "That request could not be completed.");
  }
}
