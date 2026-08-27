import type { ExecutionContext } from "@nestjs/common";

/**
 * A minimal `ExecutionContext` for guard unit tests.
 *
 * The guards touch four members of it — `switchToHttp().getRequest()`, `getHandler()` and
 * `getClass()` — while the interface declares the whole RPC/WebSocket surface as well, some of it
 * with `any` in its signature. Building the full object would mean stubbing a dozen methods the
 * guards never call, so this narrows once, here, in test-only code: the cast is safe precisely
 * because a guard that reached for anything else would throw rather than silently pass.
 */
export function executionContextFor(options: {
  request: object;
  handler?: () => void;
  controller?: new () => object;
}): ExecutionContext {
  const handler = options.handler ?? function testHandler(): void {};
  const controller = options.controller ?? class TestController {};
  const context = {
    switchToHttp: () => ({ getRequest: () => options.request }),
    getHandler: () => handler,
    getClass: () => controller,
  };
  return context as unknown as ExecutionContext;
}
