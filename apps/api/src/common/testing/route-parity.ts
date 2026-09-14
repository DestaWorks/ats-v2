import "reflect-metadata";
import { RequestMethod, type CanActivate, type Type } from "@nestjs/common";
import {
  GUARDS_METADATA,
  HTTP_CODE_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
  ROUTE_ARGS_METADATA,
  SELF_DECLARED_DEPS_METADATA,
} from "@nestjs/common/constants";
import type { Capability } from "@destaworks/domain/constants";
import { ApiExceptionFilter } from "../filters/api-exception.filter";
import { CAPABILITY_METADATA } from "../decorators/require-capability.decorator";
import type { AuthenticatedRequest } from "../guards/authenticated-request";
import { executionContextFor } from "../guards/testing/execution-context.fixture";
import { fakeHttpContext, RecordingResponse } from "./nest-host";

/** A controller method, read off the prototype. */
type Handler = (...args: never[]) => unknown;

/**
 * What a Phase 4.3 contract test needs in order to compare a controller against the Next.js route
 * it replaces, without a Nest container or an HTTP server.
 *
 * Everything here reads the DECORATORS the controller actually carries rather than accepting a
 * guard, capability or status the test names for itself. That is the whole point: a cutover test
 * that instantiates `CapabilityGuard` by hand proves the guard works, not that the route is
 * guarded — and the route being guarded is the thing that can be forgotten.
 *
 * Kept as production-typed source (not a `.test.ts`) because several test files import it, the
 * same reason `nest-host.ts` is.
 */

/** Any controller class — read for metadata only, never constructed by these helpers. */
export interface ControllerClass {
  readonly name: string;
  readonly prototype: object;
}

/** A guard Nest can instantiate itself. Both guards in `common/guards` take no required argument. */
type GuardClass = new () => CanActivate;

/** The route one controller method serves, entirely as declared by its decorators. */
export interface RouteDescriptor {
  /** `"GET"`, `"POST"`, … — from `@Get()`/`@Post()`, never from the method's name. */
  method: string;
  /** Server-relative path with `:param` segments, e.g. `/admin/users/:id/ban`. No `/api` prefix. */
  path: string;
  /** The success status, including Nest's `201`-for-POST default when no `@HttpCode` overrides it. */
  status: number;
  /** The capability `@RequireCapability` declared, or `undefined` for a route that needs none. */
  capability: Capability | undefined;
  /** The `@UseGuards` chain, in declaration order, by class name. */
  guards: string[];
}

function handlerOf(controller: ControllerClass, name: string): Handler {
  const handler: unknown = (controller.prototype as Record<string, unknown>)[name];
  if (typeof handler !== "function") {
    throw new Error(`${controller.name} has no handler named "${name}"`);
  }
  return handler as Handler;
}

/** Join a controller prefix and a handler path into one server-relative route. */
function joinPath(prefix: string, suffix: string): string {
  const segments = [prefix, suffix]
    .flatMap((part) => part.split("/"))
    .filter((part) => part !== "");
  return `/${segments.join("/")}`;
}

function metadataString(key: string, target: object): string {
  const value: unknown = Reflect.getMetadata(key, target);
  return typeof value === "string" ? value : "";
}

/**
 * Read the verb, path, success status, capability and guard chain a controller method declares.
 *
 * A test asserts these against the Next.js route's own verb/path/status, so a controller mounted
 * at the wrong path — or answering 201 where the route answered 200 — fails before any body is
 * compared.
 */
export function routeOf(controller: ControllerClass, handlerName: string): RouteDescriptor {
  const handler = handlerOf(controller, handlerName);
  const verb: unknown = Reflect.getMetadata(METHOD_METADATA, handler);
  if (typeof verb !== "number") {
    throw new Error(`${controller.name}.${handlerName} declares no HTTP method`);
  }
  const httpCode: unknown = Reflect.getMetadata(HTTP_CODE_METADATA, handler);
  const method = RequestMethod[verb] ?? "UNKNOWN";
  const capability: unknown =
    Reflect.getMetadata(CAPABILITY_METADATA, handler) ??
    Reflect.getMetadata(CAPABILITY_METADATA, controller);

  return {
    method,
    path: joinPath(
      metadataString(PATH_METADATA, controller),
      metadataString(PATH_METADATA, handler),
    ),
    status: typeof httpCode === "number" ? httpCode : method === "POST" ? 201 : 200,
    capability: typeof capability === "string" ? (capability as Capability) : undefined,
    guards: guardsOf(controller, handlerName).map((guard) => guard.name),
  };
}

/**
 * The guard classes `@UseGuards` put on the handler, falling back to the controller's own chain.
 *
 * The cast is confined here: Nest stores a mixed array of guard classes and pre-built instances,
 * and every guard this API declares is a class it constructs itself. A pre-built instance would
 * fail the `typeof === "function"` filter rather than being silently skipped.
 */
function guardsOf(controller: ControllerClass, handlerName: string): GuardClass[] {
  const declared: unknown =
    Reflect.getMetadata(GUARDS_METADATA, handlerOf(controller, handlerName)) ??
    Reflect.getMetadata(GUARDS_METADATA, controller);
  if (!Array.isArray(declared)) return [];
  return declared.filter((guard): guard is GuardClass => typeof guard === "function");
}

/**
 * Run the guard chain a route DECLARES against one request, in order, exactly as Nest would.
 *
 * Resolves when every guard admits the caller; rejects with the first guard's `AppError` when one
 * refuses. A route that declares no guards throws instead — an unguarded handler is a finding, not
 * a passing test.
 */
export async function runDeclaredGuards(
  controller: ControllerClass,
  handlerName: string,
  request: AuthenticatedRequest,
): Promise<void> {
  const guards = guardsOf(controller, handlerName);
  if (guards.length === 0) {
    throw new Error(`${controller.name}.${handlerName} declares no @UseGuards`);
  }
  const context = executionContextFor({
    request,
    handler: handlerOf(controller, handlerName) as () => void,
    // `getClass()` is read by `Reflector` for controller-level metadata and is never constructed,
    // so a controller with injected constructor parameters is a valid argument here.
    controller: controller as unknown as new () => object,
  });
  for (const Guard of guards) {
    await new Guard().canActivate(context);
  }
}

/** What the client receives when a request fails: the status line and the error envelope. */
export interface RenderedError {
  status: number | undefined;
  body: unknown;
}

/**
 * Render a failure the way the API answers it — through the real `ApiExceptionFilter`, which is
 * the port of `apiHandler`'s mapping. Lets a contract test assert the envelope a Next.js route
 * returns today for the same thrown value, rather than asserting the thrown value itself.
 */
export async function renderFailure(call: () => unknown): Promise<RenderedError> {
  try {
    await call();
  } catch (error) {
    const response = new RecordingResponse();
    new ApiExceptionFilter().catch(error, fakeHttpContext({}, response));
    return { status: response.statusCode, body: response.body };
  }
  throw new Error("expected the call to fail, but it resolved");
}

/** Something bound to a handler parameter that validates or transforms its value. */
export interface BoundPipe {
  transform(value: unknown): unknown;
}

/**
 * Every pipe instance bound to a parameter of one handler, across all of its parameters.
 *
 * A `ZodValidationPipe` is constructed with a contract schema and attached at the parameter, so
 * this is how a test proves the handler is validated by the SCHEMA the Next.js route used —
 * rather than re-parsing with a schema the test picked, which would pass even if the controller
 * bound the wrong one or bound nothing at all.
 */
export function boundPipes(controller: ControllerClass, handlerName: string): BoundPipe[] {
  const args: unknown = Reflect.getMetadata(ROUTE_ARGS_METADATA, controller, handlerName);
  if (args === null || typeof args !== "object") return [];
  const pipes: BoundPipe[] = [];
  for (const param of Object.values(args)) {
    if (param === null || typeof param !== "object") continue;
    const declared: unknown = (param as { pipes?: unknown }).pipes;
    if (!Array.isArray(declared)) continue;
    for (const pipe of declared) {
      if (pipe !== null && typeof pipe === "object" && "transform" in pipe) {
        pipes.push(pipe as BoundPipe);
      }
    }
  }
  return pipes;
}

/**
 * The injection tokens a controller's constructor declares, by parameter index.
 *
 * `emitDecoratorMetadata` is off, so an injected parameter that carries no `@Inject(TOKEN)`
 * produces no metadata at all: it compiles, it lints, and it fails when the container tries to
 * resolve it. Asserting this is how that failure is caught at test time instead of at boot.
 */
export function injectedTokens(controller: ControllerClass): unknown[] {
  const declared: unknown = Reflect.getMetadata(SELF_DECLARED_DEPS_METADATA, controller);
  if (!Array.isArray(declared)) return [];
  const tokens: unknown[] = [];
  for (const entry of declared) {
    if (entry === null || typeof entry !== "object") continue;
    const { index, param } = entry as { index?: unknown; param?: unknown };
    if (typeof index === "number") tokens[index] = param;
  }
  return tokens;
}

/**
 * The seam the Phase 4.3 contract tests are written against: run one controller handler the way
 * Nest will run it — its declared guards, then the handler, then the exception filter — and reduce
 * the result to the same `{ status, body }` a Next.js `Response` reduces to.
 *
 * A parity test needs both halves in the SAME shape or it is comparing a `Response` to a plain
 * object and proving nothing. `body` is therefore JSON round-tripped on the controller side too:
 * `Response.json()` drops `undefined` members and calls `toJSON`, and a controller that returned a
 * `Date` where the route returned an ISO string would otherwise pass.
 *
 * Kept as production-typed source (not a `.test.ts`) because several test files import it, matching
 * `./nest-host`.
 */

/** A route's outcome, normalised across the two transports. */
export interface Outcome {
  status: number;
  body: unknown;
}

/** The verb, path, success status and authorization a controller handler is registered with. */
export interface RouteSurface {
  method: string;
  /** Controller prefix joined to the handler path, e.g. `/crm/clients/:id/deals/:dealId`. */
  path: string;
  status: number;
  capability: Capability | undefined;
  /** Guard class names in declaration order — controller-level guards included. */
  guards: string[];
}

/** Nest's own default: a POST answers 201, every other verb 200, unless `@HttpCode` says otherwise. */
const CREATED = 201;
const OK = 200;

function metadata<T>(key: string, ...targets: object[]): T | undefined {
  for (const target of targets) {
    const value: unknown = Reflect.getMetadata(key, target);
    if (value !== undefined) return value as T;
  }
  return undefined;
}

export function routeSurface(controller: Type<object>, name: string): RouteSurface {
  const handler = handlerOf(controller, name);
  const verb = metadata<RequestMethod>(METHOD_METADATA, handler) ?? RequestMethod.GET;
  const explicitStatus = metadata<number>(HTTP_CODE_METADATA, handler);
  const guards = metadata<Type<CanActivate>[]>(GUARDS_METADATA, handler, controller) ?? [];
  return {
    method: RequestMethod[verb],
    path: joinPath(
      metadata<string>(PATH_METADATA, controller) ?? "",
      metadata<string>(PATH_METADATA, handler) ?? "",
    ),
    status: explicitStatus ?? (verb === RequestMethod.POST ? CREATED : OK),
    capability: metadata<Capability>(CAPABILITY_METADATA, handler, controller),
    guards: guards.map((guard) => guard.name),
  };
}

/** Render a thrown value the way the running API would — through the one exception filter. */
function rendered(error: unknown, request: object): Outcome {
  const response = new RecordingResponse();
  new ApiExceptionFilter().catch(error, fakeHttpContext(request, response));
  return { status: response.statusCode ?? OK, body: response.body };
}

/**
 * Run the guards a handler declares, in order, against `request`. Resolves to `null` when they all
 * pass (the request object now carries whatever they attached), or to the refusal they produced.
 *
 * The guards are constructed with no arguments, which is how Nest instantiates them here too: none
 * of them has an injected dependency, and `CapabilityGuard`/`RateLimitGuard` default their
 * `Reflector`.
 */
export async function guardOutcome(
  controller: Type<object>,
  name: string,
  request: object,
): Promise<Outcome | null> {
  const handler = handlerOf(controller, name);
  const guards = metadata<Type<CanActivate>[]>(GUARDS_METADATA, handler, controller) ?? [];
  const context = executionContextFor({ request, handler, controller });
  try {
    for (const Guard of guards) await new Guard().canActivate(context);
    return null;
  } catch (error) {
    return rendered(error, request);
  }
}

/**
 * Invoke a handler and reduce it to `{ status, body }` — the success status its decorators declare,
 * or whatever the exception filter makes of a throw.
 */
export async function handlerOutcome(
  controller: Type<object>,
  name: string,
  invoke: () => Promise<unknown>,
  request: object = {},
): Promise<Outcome> {
  try {
    const result = await invoke();
    return {
      status: routeSurface(controller, name).status,
      body: JSON.parse(JSON.stringify(result ?? null)) as unknown,
    };
  } catch (error) {
    return rendered(error, request);
  }
}
