import "reflect-metadata";
import { Module, type Type } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import type { INestApplication } from "@nestjs/common";
import { REQUEST_PIPELINE_PROVIDERS } from "../../app.module";
import { installNestRequestContext } from "../request-context/nest-request-context";
import { requestContextMiddleware } from "../request-context/request-context.middleware";

/**
 * Boots ONE domain module as a real HTTP server for contract tests (SAAS-RESTRUCTURE-PLAN 4.3:
 * "each PR: contract test asserting request/response parity with the route it replaces").
 *
 * It is a real server on purpose. A contract test that called a controller method directly would
 * prove nothing about the two things most likely to diverge from the App Router route: the STATUS
 * CODE (Nest defaults POST to 201, `apiHandler` to 200) and the ERROR ENVELOPE, both of which are
 * produced by the framework and the exception filter rather than by the controller. So the module
 * under test is mounted behind `REQUEST_PIPELINE_PROVIDERS` — the same interceptors and the same
 * filter `AppModule` registers — and driven over the loopback interface with `fetch`, exactly as a
 * client drives it.
 *
 * The services stay mocked at the module boundary (`vi.mock` on the `@destaworks/application/*`
 * singleton the domain module binds), so what runs for real is everything BETWEEN the wire and the
 * service: routing, guards, the Zod pipe, the DTO gate, the interceptors and the filter.
 */
export interface ContractHost {
  /** Origin of the running server, e.g. `http://127.0.0.1:53124`. No trailing slash. */
  readonly origin: string;
  /** `fetch` against the server, with `path` resolved relative to its origin. */
  request(path: string, init?: RequestInit): Promise<Response>;
  close(): Promise<void>;
}

/**
 * Start `moduleUnderTest` on an ephemeral port.
 *
 * Bootstrap mirrors `main.ts`: the `RequestContext` adapter is installed before the app is created
 * (`packages/auth` reads headers and cookies only through it, and it never falls back), and the
 * middleware keeps the request in scope past `canActivate`.
 */
export async function startContractHost(moduleUnderTest: Type<unknown>): Promise<ContractHost> {
  installNestRequestContext();

  @Module({ imports: [moduleUnderTest], providers: REQUEST_PIPELINE_PROVIDERS })
  class ContractTestModule {}

  // `abortOnError` defaults to true, which makes Nest call `process.abort()` on a wiring failure —
  // in a Vitest worker that kills the run with a native stack trace and no message. Throwing turns
  // a mis-wired module into a readable test failure.
  const app: INestApplication = await NestFactory.create(ContractTestModule, {
    logger: false,
    abortOnError: false,
  });
  app.use(requestContextMiddleware);
  await app.listen(0, "127.0.0.1");
  const origin = (await app.getUrl()).replace("[::1]", "127.0.0.1").replace(/\/$/, "");

  return {
    origin,
    request: (path, init) => fetch(`${origin}${path}`, init),
    close: () => app.close(),
  };
}

/** POST/PATCH helper: a JSON body with the header the parser needs, so no test restates it. */
export function jsonBody(body: unknown, method = "POST"): RequestInit {
  return {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  };
}

/** The error envelope every failure shares — `{ error: { code, message, issues?, ref? } }`. */
export interface ErrorEnvelope {
  error: {
    code: string;
    message: string;
    issues?: { path: string; message: string }[];
    ref?: string;
  };
}
