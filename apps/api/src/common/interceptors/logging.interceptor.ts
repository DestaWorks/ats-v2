import { Injectable } from "@nestjs/common";
import type { CallHandler, ExecutionContext, NestInterceptor } from "@nestjs/common";
import { Observable } from "rxjs";
import { tap } from "rxjs/operators";
import { logger } from "@destaworks/config/logger";
import {
  classifyError,
  errorLogEntry,
  successLogEntry,
} from "@destaworks/integrations/http/api-error";
import { describeRequest } from "../http";
import type { HttpRequestLike, HttpResponseLike } from "../http";

/** What the interceptor reads back off the response to record the status actually sent. */
interface StatusCarrier extends HttpResponseLike {
  readonly statusCode?: number | undefined;
}

/**
 * Emits exactly one structured line per request — method, query-free route, status, durationMs —
 * with `requestId`, `tenantId` and `userId` supplied by the log context the request-id interceptor
 * established. It is the sole log site for a request, so a failure produces one line, not two.
 *
 * Levels follow the outcome, not the fact that an exception was thrown: a rejected `AppError` or a
 * `ZodError` is control flow and logs at `debug`; only an unexpected error logs at `error`. An
 * unexpected error's message never reaches the line — `classifyError` discards it, because Prisma
 * embeds the offending field VALUES in its messages.
 *
 * Register it after `RequestIdInterceptor` so its lines carry the id.
 */
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const { method, route } = describeRequest(http.getRequest<HttpRequestLike>());
    const startedAt = Date.now();

    return next.handle().pipe(
      tap({
        // `complete`, not `next`: a handler that emits more than once still gets one line.
        complete: () => {
          const status = http.getResponse<StatusCarrier>().statusCode ?? 200;
          const entry = successLogEntry(status, {
            method,
            route,
            durationMs: Date.now() - startedAt,
          });
          logger[entry.level](entry.event, entry.fields);
        },
        // The status the filter is about to send is derived from the error, not read off the
        // response — nothing has written to it yet at this point in the pipeline.
        error: (err: unknown) => {
          const entry = errorLogEntry(classifyError(err), {
            method,
            route,
            durationMs: Date.now() - startedAt,
          });
          logger[entry.level](entry.event, entry.fields);
        },
      }),
    );
  }
}
