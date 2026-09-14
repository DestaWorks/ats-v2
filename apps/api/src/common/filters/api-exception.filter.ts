import { randomUUID } from "node:crypto";
import { Catch, HttpException, Injectable } from "@nestjs/common";
import type { ArgumentsHost, ExceptionFilter } from "@nestjs/common";
import * as Sentry from "@sentry/node";
import { currentLogContext } from "@destaworks/config/logger";
import {
  classifyError,
  errorEnvelope,
  frameworkError,
} from "@destaworks/integrations/http/api-error";
import { readRequestId } from "../http";
import type { HttpResponseLike } from "../http";

/**
 * The NestJS port of `apiHandler`'s error mapping: every thrown value becomes the same
 * `{ error: { code, message, issues?, ref? } }` envelope, with `code` drawn from the one
 * `AppErrorCode` union, at the same status the Next.js routes return today.
 *
 * - `AppError`    → `err.status` + `{ code, message }`
 * - `ZodError`    → 422 + `{ code: "BAD_REQUEST", message, issues: [{ path, message }] }`
 * - anything else → 500 + a fixed generic message and a `ref`
 *
 * An unexpected error never leaks its message — not to the client and not to a log line — because
 * Prisma embeds the offending field VALUES in its messages, and this app holds PII/PHI. Sentry is
 * therefore the only place the real exception survives, tagged with the request's `requestId` so
 * the `ref` a user quotes resolves to one event and one log line. Handled `AppError`s are
 * expected control flow and are not reported.
 *
 * It deliberately does NOT log: `LoggingInterceptor` owns the single line per request.
 */
@Catch()
@Injectable()
export class ApiExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const requestId = this.resolveRequestId(http.getRequest<object>());

    // Nest raises its own HttpException for routing and framework failures — an unmatched route is
    // a 404, not a server fault. Classifying those as `unexpected` would answer 500 and report a
    // Sentry event for every stray URL a crawler tries. Only the status and the client-safe reason
    // phrase are carried over; the exception's body is never echoed, for the same reason
    // `classifyError` drops an unexpected error's message.
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      http.getResponse<HttpResponseLike>().status(status);
      http.getResponse<HttpResponseLike>().json(errorEnvelope(frameworkError(status), requestId));
      return;
    }

    const classified = classifyError(exception);

    if (classified.kind === "unexpected") {
      Sentry.captureException(exception, { tags: { requestId } });
    }

    const response = http.getResponse<HttpResponseLike>();
    response.status(classified.status);
    response.json(errorEnvelope(classified, requestId));
  }

  /**
   * The id `RequestIdInterceptor` established, preferring the stamp on the request because this
   * filter runs outside the interceptor's AsyncLocalStorage scope. The last resort keeps a `ref`
   * present even when nothing upstream ran (a failure in middleware, or an unwired app) — it just
   * will not correlate, which is strictly better than returning a 500 with no handle at all.
   */
  private resolveRequestId(request: object): string {
    return readRequestId(request) ?? currentLogContext()?.requestId ?? randomUUID();
  }
}
