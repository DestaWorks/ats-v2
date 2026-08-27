import type { CallHandler, ExecutionContext } from "@nestjs/common";
import type { Observable } from "rxjs";
import type { HttpResponseLike } from "../http";

/**
 * Test doubles for the two NestJS seams the cross-cutting classes touch: the execution context
 * and the call handler. Shared so the filter and both interceptors are exercised against one
 * definition of "what Nest hands us" rather than three drifting copies.
 *
 * Kept as production-typed source (not a `.test.ts`) only because three test files import it.
 */

/** Captures what the exception filter wrote, in the order it wrote it. */
export class RecordingResponse implements HttpResponseLike {
  statusCode: number | undefined;
  body: unknown;

  status(code: number): this {
    this.statusCode = code;
    return this;
  }

  json(body: unknown): this {
    this.body = body;
    return this;
  }
}

/**
 * An `ExecutionContext` over a request/response pair.
 *
 * The `as` casts are confined to this fixture: `getRequest<T>()`/`getResponse<T>()` are declared
 * to return whatever the caller asks for, and building the full RPC + WebSocket + reflection
 * surface of `ExecutionContext` would be dead weight for classes that only call `switchToHttp()`.
 */
export function fakeHttpContext(request: object, response: object): ExecutionContext {
  const http = {
    getRequest: <T>(): T => request as T,
    getResponse: <T>(): T => response as T,
    getNext: <T>(): T => undefined as T,
  };
  return { switchToHttp: () => http } as unknown as ExecutionContext;
}

/** A `CallHandler` that yields the given observable, re-derived on every subscribe. */
export function fakeCallHandler(source: () => Observable<unknown>): CallHandler {
  return { handle: source };
}
