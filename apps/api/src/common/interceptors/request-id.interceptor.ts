import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import type { CallHandler, ExecutionContext, NestInterceptor } from "@nestjs/common";
import { Observable } from "rxjs";
import { runWithLogContext } from "@destaworks/config/logger/request-context";
import { attachRequestId } from "../http";

/**
 * Establishes the correlation id for a request: mints one, stamps it on the request object, and
 * runs the remainder of the pipeline inside the logger's AsyncLocalStorage context so every line
 * emitted during the request carries it without being threaded through any signature.
 *
 * That id is the one the exception filter returns to the client as `error.ref` on a 500 — there is
 * no second uuid anywhere, so a user quoting a ref lands on exactly one log line.
 *
 * Must be registered FIRST among the global interceptors; anything ordered ahead of it logs
 * without a `requestId`.
 */
@Injectable()
export class RequestIdInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const requestId = randomUUID();
    attachRequestId(context.switchToHttp().getRequest<object>(), requestId);
    // Subscribing INSIDE the context is what propagates it: `next.handle()` only builds the
    // observable, so wrapping that call alone would leave the store exited before the handler ran.
    return new Observable<unknown>((subscriber) =>
      runWithLogContext({ requestId }, () => next.handle().subscribe(subscriber)),
    );
  }
}
