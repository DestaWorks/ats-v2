import {
  Module,
  type INestApplication,
  type ModuleMetadata,
  type Type,
  type ValueProvider,
} from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { provideService, type ServiceToken } from "../../modules/service-token";
import { ApiExceptionFilter } from "../filters/api-exception.filter";
import { LoggingInterceptor } from "../interceptors/logging.interceptor";
import { RequestIdInterceptor } from "../interceptors/request-id.interceptor";
import { requestContextMiddleware } from "../request-context/request-context.middleware";

/**
 * Boots a REAL NestJS application over a real HTTP socket for one test, wired exactly as
 * `main.ts` wires the production app: the request-context middleware, then
 * RequestId → Logging interceptors, then the exception filter.
 *
 * A contract test has to prove the whole transport chain — guard, pipe, handler, filter — answers
 * the same status and the same body as the Next.js route it replaces. Calling a controller method
 * directly proves none of that: it skips the `@RequireCapability` metadata the guard reads, skips
 * the `ZodValidationPipe` bound to the parameter, and skips the envelope the filter renders. So
 * the harness serves the controller over HTTP and the test uses `fetch`, the same client the
 * browser and the Next.js route tests use.
 *
 * Kept as production-typed source rather than a `.test.ts` because several contract tests import
 * it — the same reason `nest-host.ts` is.
 */
export interface TestApi {
  /** Absolute URL for a controller path, e.g. `path("/reports/executive?clientId=c1")`. */
  url(path: string): string;
  /** `fetch` against this app. Relative paths only. */
  fetch(path: string, init?: RequestInit): Promise<Response>;
  close(): Promise<void>;
}

/**
 * Bind a token to a stand-in carrying only the methods the endpoints under test call.
 *
 * A contract test drives a handful of routes, so the rest of the service is unreachable from
 * them. Taking the TOKEN is what makes `methods` type-checked: `TService` is fixed by the token,
 * so a method named wrongly or typed wrongly is a compile error, and the one widening cast lives
 * here rather than at every provider.
 */
export function provideFakeService<TService>(
  token: ServiceToken<TService>,
  methods: Partial<TService>,
): ValueProvider<TService> {
  return provideService(token, methods as TService);
}

/** `@Module(metadata) class {}` without decorator syntax, so the metadata can be a parameter. */
function testModule(metadata: ModuleMetadata): Type<unknown> {
  class ContractTestModule {}
  Module(metadata)(ContractTestModule);
  return ContractTestModule;
}

function resolvePort(app: INestApplication): number {
  const address: unknown = app.getHttpServer().address();
  if (typeof address !== "object" || address === null || !("port" in address)) {
    throw new Error("The test app is not listening on a TCP socket");
  }
  const { port } = address;
  if (typeof port !== "number") throw new Error("The test app reported no port");
  return port;
}

/** Start an app containing just the controllers and providers one contract test needs. */
export async function startTestApi(metadata: ModuleMetadata): Promise<TestApi> {
  // `abortOnError: false` because Nest's default is `process.abort()` on a wiring failure, which
  // kills the vitest worker and reports a native stack trace instead of the DI error.
  const app = await NestFactory.create(testModule(metadata), {
    logger: false,
    abortOnError: false,
  });
  app.use(requestContextMiddleware);
  app.useGlobalInterceptors(new RequestIdInterceptor(), new LoggingInterceptor());
  app.useGlobalFilters(new ApiExceptionFilter());
  await app.listen(0, "127.0.0.1");
  const origin = `http://127.0.0.1:${String(resolvePort(app))}`;
  return {
    url: (path) => `${origin}${path}`,
    fetch: (path, init) => fetch(`${origin}${path}`, init),
    close: () => app.close(),
  };
}
