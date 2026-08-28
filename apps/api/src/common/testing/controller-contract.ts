import "reflect-metadata";
import { RequestMethod, type CanActivate } from "@nestjs/common";
import {
  GUARDS_METADATA,
  HTTP_CODE_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from "@nestjs/common/constants";
import { RATE_LIMIT_METADATA, type RateLimitRule } from "../decorators/rate-limit.decorator";
import { CAPABILITY_METADATA } from "../decorators/require-capability.decorator";
import { executionContextFor } from "../guards/testing/execution-context.fixture";

/**
 * What a contract test needs to ask of a controller, in one place instead of once per area.
 *
 * A Phase 4.3 controller makes two kinds of promise, and they fail differently:
 *
 *  1. The DECLARED one — verb, path, guards, capability, rate limit, status code. It lives entirely
 *     in decorator metadata, is invisible to the type system, and a wrong or missing decorator is
 *     silent: the route just answers a different URL, or answers everyone. `describeRoutes` reads
 *     that metadata back so a test can compare the whole controller against the Next.js routes it
 *     replaces in one table.
 *  2. The BEHAVIOURAL one — the guards actually run, in order, before the handler does.
 *     `throughGuards` runs them against a real request object so a refusal is observed the way a
 *     caller observes it, rather than asserted from the decorator alone.
 *
 * Production-typed source rather than a `.test.ts` because every area's tests import it.
 */

/** The shape a controller class presents to this module. Any `class Foo {}` satisfies it. */
export interface ControllerClass {
  readonly name: string;
  readonly prototype: object;
}

/** One route, flattened to the facts a parity table compares. */
export interface RouteDescriptor {
  /** `"POST /leads/:id/outreach"` — verb and full path, exactly as a client would call it. */
  readonly route: string;
  /** Guard class names, controller-level first, in the order Nest will run them. */
  readonly guards: readonly string[];
  /** The capability `CapabilityGuard` will demand, method metadata overriding class metadata. */
  readonly capability: string | null;
  /** The rate-limit bucket name, or `null` when the handler declares no rule. */
  readonly rateLimit: string | null;
  /** The status a success answers with, including Nest's 201-for-POST default. */
  readonly status: number;
}

/** `Reflect.getMetadata` is declared to return `any`; this is where that `any` stops. */
function metadata(key: string, target: object): unknown {
  return Reflect.getMetadata(key, target);
}

const VERBS = new Map<number, string>([
  [RequestMethod.GET, "GET"],
  [RequestMethod.POST, "POST"],
  [RequestMethod.PUT, "PUT"],
  [RequestMethod.DELETE, "DELETE"],
  [RequestMethod.PATCH, "PATCH"],
  [RequestMethod.OPTIONS, "OPTIONS"],
  [RequestMethod.HEAD, "HEAD"],
  [RequestMethod.ALL, "ALL"],
]);

/** Nest answers 201 to a POST unless the handler says otherwise; everything else is 200. */
const CREATED = 201;
const OK = 200;

function pathSegment(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function joinPath(base: string, sub: string): string {
  const parts = [base, sub].map((p) => p.replace(/^\/+|\/+$/gu, "")).filter((p) => p !== "");
  return `/${parts.join("/")}`;
}

function guardNames(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((guard) => {
    if (typeof guard === "function") return guard.name;
    // An instance-registered guard (`@UseGuards(new Foo())`) reports its class name too.
    return guard === null || guard === undefined ? String(guard) : guard.constructor.name;
  });
}

function capabilityOf(handler: object, controller: object): string | null {
  const own = metadata(CAPABILITY_METADATA, handler) ?? metadata(CAPABILITY_METADATA, controller);
  return typeof own === "string" ? own : null;
}

function rateLimitOf(handler: object, controller: object): string | null {
  const rule = metadata(RATE_LIMIT_METADATA, handler) ?? metadata(RATE_LIMIT_METADATA, controller);
  if (rule === null || typeof rule !== "object") return null;
  const { name } = rule as RateLimitRule;
  return typeof name === "string" ? name : null;
}

function statusOf(handler: object, verb: string): number {
  const declared = metadata(HTTP_CODE_METADATA, handler);
  if (typeof declared === "number") return declared;
  return verb === "POST" ? CREATED : OK;
}

/**
 * Every route a controller declares, in declaration order — which is also the order Nest matches
 * them in, so a `:id` shadowing a literal segment shows up here as a wrong ordering.
 */
export function describeRoutes(controller: ControllerClass): RouteDescriptor[] {
  const base = pathSegment(metadata(PATH_METADATA, controller));
  const classGuards = guardNames(metadata(GUARDS_METADATA, controller));
  const routes: RouteDescriptor[] = [];

  for (const name of Object.getOwnPropertyNames(controller.prototype)) {
    if (name === "constructor") continue;
    const descriptor = Object.getOwnPropertyDescriptor(controller.prototype, name);
    const handler: unknown = descriptor?.value;
    if (typeof handler !== "function") continue;
    const verb = VERBS.get(Number(metadata(METHOD_METADATA, handler)));
    if (verb === undefined || metadata(METHOD_METADATA, handler) === undefined) continue;

    routes.push({
      route: `${verb} ${joinPath(base, pathSegment(metadata(PATH_METADATA, handler)))}`,
      guards: [...classGuards, ...guardNames(metadata(GUARDS_METADATA, handler))],
      capability: capabilityOf(handler, controller),
      rateLimit: rateLimitOf(handler, controller),
      status: statusOf(handler, verb),
    });
  }

  return routes;
}

/** The handler a guard chain is protecting, resolved off the controller's prototype. */
export function handlerOf(controller: ControllerClass, method: string): (...args: never[]) => void {
  const handler: unknown = Object.getOwnPropertyDescriptor(controller.prototype, method)?.value;
  if (typeof handler !== "function") {
    throw new Error(`${controller.name} has no method ${method}`);
  }
  // The metadata a guard reads lives on this function object; the cast only drops the signature,
  // which no guard and no fixture ever calls.
  return handler as (...args: never[]) => void;
}

/**
 * Run `guards` against `request` the way Nest would — in order, sharing one execution context, each
 * able to see what the previous one attached — then invoke the controller method.
 *
 * `invoke` is a closure rather than a reflective call so the test states the arguments the route
 * would have parsed, and so `@CurrentUser()`-style parameters (which Nest resolves, not the guard
 * chain) are supplied explicitly instead of being silently `undefined`.
 */
export async function throughGuards<TResult>(call: {
  controller: ControllerClass;
  method: string;
  guards: readonly CanActivate[];
  request: object;
  invoke: (request: object) => TResult | Promise<TResult>;
}): Promise<TResult> {
  const context = executionContextFor({
    request: call.request,
    handler: handlerOf(call.controller, call.method),
    // `executionContextFor` types this as a zero-argument constructor because its own callers pass
    // stub classes; a real controller takes its service in the constructor. Only `getClass()` ever
    // sees it, and class-level metadata lives on the class object itself, never on an instance.
    controller: call.controller as unknown as new () => object,
  });

  for (const guard of call.guards) {
    const admitted = await guard.canActivate(context);
    if (admitted !== true) {
      throw new Error(`${guard.constructor.name} refused without throwing`);
    }
  }

  return await call.invoke(call.request);
}

/**
 * A controller's service dependency, stubbed to only the methods one test drives.
 *
 * The application services are wide (a dozen-plus methods each) and a controller test exercises one
 * of them at a time; a full fake would be a hundred lines of `vi.fn()` per file, most of it never
 * called. The cast is confined here: a method the controller reaches for and the stub does not
 * define fails loudly as "not a function" rather than quietly passing.
 */
export function serviceStub<TService extends object>(methods: Partial<TService>): TService {
  return methods as TService;
}
