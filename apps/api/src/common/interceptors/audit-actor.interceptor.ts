import "reflect-metadata";
import { AppError } from "@destaworks/integrations/http/app-error";

/**
 * WHY THIS INTERCEPTOR DOES NOT WRITE AUDIT ROWS
 *
 * Auditing already lives inside the services: 84 `writeAudit(tx, …)` calls across
 * `packages/application/src/**`, every one of them passing the transaction client so the
 * `activity_log` row commits or rolls back with the mutation it records. An interceptor cannot
 * reproduce that. It runs outside the transaction, so it would audit a mutation that rolled
 * back; it sees only the HTTP envelope, so it has none of the `entity` / `entityId` /
 * `before` / `after` the trail is made of; and — the reason this is not a close call — a second
 * writer would DOUBLE every audited mutation. A duplicated compliance trail is worse than a
 * thin one, because it is no longer evidence of what happened.
 *
 * `apps/api/src/common/interceptors/audit-actor.interceptor.test.ts` holds that as an
 * invariant: the transport layer never calls `writeAudit`, and the application layer always
 * does.
 *
 * What IS missing at the transport layer is the other half of a trail row: the actor. Every
 * `writeAudit` call takes `actor` from an identity the CALLER supplied (73 of them literally
 * `actor: user.id`), and in Next.js that identity came from `requireUser()` inside the same
 * handler. Under NestJS it arrives on the request object from the AuthGuard, one layer away
 * from the service — so a mutating route that is wired without its guard reaches the service
 * with no actor at all, and the trail records a mutation it cannot attribute. That is what this
 * interceptor prevents, and it is all it does.
 */

/** The minimal `ExecutionContext` surface this interceptor uses. Nest's is assignable to it. */
export interface HttpArgumentsHostLike {
  getRequest<T>(): T;
}

/** @see HttpArgumentsHostLike */
export interface ExecutionContextLike {
  switchToHttp(): HttpArgumentsHostLike;
  /** Optional so a hand-built test context stays assignable; Nest's own context provides both. */
  getHandler?(): object;
  getClass?(): object;
}

/** The minimal `CallHandler` surface: invoking it runs the route handler. */
export interface CallHandlerLike<R> {
  handle(): R;
}

/** The request as it looks after the AuthGuard has (or has not) resolved a principal onto it. */
export interface AuditActorRequest {
  method?: string;
  /** `unknown` on purpose: `getRequest<T>()` is an unchecked assertion, so this is narrowed. */
  user?: unknown;
  /** What `PortalAuthGuard` attaches. A separate property because the two never merge. */
  portal?: unknown;
}

/**
 * A named, reasoned exemption for a route that legitimately mutates without a signed-in operator
 * — the client portal's token-bearing contact, an inbound webhook, sign-up. Declared per route
 * with `@UnattributedMutation({ reason })`, or once for a whole host at the wiring site, so the
 * exemption is visible in review the way `PERMITTED` in `scripts/check-architecture.mjs` and
 * `RESPONSE_TYPE_EXEMPTIONS` in the contract test already are. There is no silent skip.
 */
export interface UnattributedAllowance {
  reason: string;
}

/** Metadata key `@UnattributedMutation({ reason })` writes, so one route may carry the allowance. */
export const UNATTRIBUTED_MUTATION_METADATA = "destaworks:unattributed-mutation";

/** The allowance a route declared, narrowed by hand — decorator metadata is `unknown` at runtime. */
function declaredAllowance(target: object | undefined): UnattributedAllowance | undefined {
  if (target === undefined) return undefined;
  const declared: unknown = Reflect.getMetadata(UNATTRIBUTED_MUTATION_METADATA, target);
  if (typeof declared !== "object" || declared === null || !("reason" in declared)) {
    return undefined;
  }
  const reason: unknown = declared.reason;
  return typeof reason === "string" && reason.length > 0 ? { reason } : undefined;
}

const MUTATING_METHODS: ReadonlySet<string> = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * The resolved actor id, or `null` if the request carries no usable principal.
 *
 * The principal is the request's `TenantContext` since 6.4, so the identity sits one level in, at
 * `user.user.id`. The narrowing stays hand-rolled and total — the field is typed `unknown`
 * because `getRequest<T>()` is an unchecked assertion, and this interceptor exists precisely for
 * the case where the guard that was supposed to populate it did not run.
 */
function resolvedActorId(user: unknown): string | null {
  if (typeof user !== "object" || user === null) return null;
  if (!("user" in user)) return null;
  const identity: unknown = user.user;
  if (typeof identity !== "object" || identity === null) return null;
  if (!("id" in identity)) return null;
  const id: unknown = identity.id;
  return typeof id === "string" && id.length > 0 ? id : null;
}

/**
 * The portal contact's id, or `null`.
 *
 * A portal mutation is ATTRIBUTED, not unattributed: `PortalAuthGuard` resolves an external client
 * contact from the `portal_token` cookie server-side and attaches it as `request.portal`. It is a
 * different principal from an operator, not the absence of one — so it resolves here rather than
 * taking `@UnattributedMutation`, which would admit the route even when the guard populated
 * nothing and is precisely the case this interceptor exists to fail.
 */
function resolvedPortalActorId(portal: unknown): string | null {
  if (typeof portal !== "object" || portal === null) return null;
  if (!("contactId" in portal)) return null;
  const id: unknown = portal.contactId;
  return typeof id === "string" && id.length > 0 ? id : null;
}

/**
 * Fails a mutating request closed when no server-resolved actor reached the handler, so that no
 * mutation can be recorded in `activity_log` without an attributable `actor`.
 *
 * Defence in depth rather than authentication: it never resolves a session and never inspects
 * anything the client sent — it reads only the principal the AuthGuard already put on the
 * request. Its value is the case where the guard is absent, which during a 141-route cutover is
 * a mistake that would otherwise surface as an unattributed row months later.
 *
 * Reads (`GET`, `HEAD`, `OPTIONS`) pass through untouched: they write no trail, and whether they
 * require a session is the guards' decision, not this one's.
 *
 * The rejection is `AppError("UNAUTHORIZED", "Sign in required")` — byte-identical to what
 * `requireUser()` throws today, so a route behaves the same before and after its cutover. The
 * exception filter renders it; this class formats nothing.
 *
 * Structurally a NestJS `NestInterceptor` (`intercept` instantiated at `R = Observable<T>`); it
 * imports nothing from `@nestjs/common` or `rxjs` so it carries no dependency the Phase 4.1
 * scaffold has not installed yet.
 */
export class AuditActorInterceptor {
  constructor(private readonly unattributed?: UnattributedAllowance) {}

  intercept<R>(context: ExecutionContextLike, next: CallHandlerLike<R>): R {
    const request = context.switchToHttp().getRequest<AuditActorRequest>();
    const method = (request.method ?? "").toUpperCase();

    const allowance =
      this.unattributed ??
      declaredAllowance(context.getHandler?.()) ??
      declaredAllowance(context.getClass?.());

    if (MUTATING_METHODS.has(method) && allowance === undefined) {
      const actor = resolvedActorId(request.user) ?? resolvedPortalActorId(request.portal);
      if (actor === null) {
        throw new AppError("UNAUTHORIZED", "Sign in required");
      }
    }

    return next.handle();
  }
}
