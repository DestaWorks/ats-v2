import { prisma } from "./prisma";
import type { Prisma as PrismaNs } from "./generated/prisma/client";

type PrismaTransactionClient = PrismaNs.TransactionClient;
import type { TenantContext } from "@destaworks/domain/tenant";
import { GLOBAL_MODELS } from "./tenant-models";
import {
  ambientTenantTransaction,
  runWithAmbientTenantTransaction,
  setTenantIdOnConnection,
} from "./tenant-connection";

/**
 * Operations that take a `where`. `create`, `createMany` and `createManyAndReturn` do not, and
 * Prisma rejects the argument outright rather than ignoring it — so the filter is added by
 * operation, not unconditionally.
 */
const WHERE_OPERATIONS: ReadonlySet<string> = new Set([
  "findUnique",
  "findUniqueOrThrow",
  "findFirst",
  "findFirstOrThrow",
  "findMany",
  "update",
  "updateMany",
  "updateManyAndReturn",
  "delete",
  "deleteMany",
  "upsert",
  "count",
  "aggregate",
  "groupBy",
]);

/**
 * Argument keys that carry a write payload: `data` for create/update/createMany, and the
 * `create`/`update` pair an `upsert` splits it into — an upsert that only stamped `data` would
 * insert a row with no tenant.
 */
const PAYLOAD_KEYS = ["data", "create", "update"] as const;

/**
 * Stamp the tenant onto a write payload, copying rather than mutating: `args` belongs to the
 * caller, and a repository that reuses one object across two calls must not accumulate our edits.
 *
 * Top level only. A nested relation write (`data: { notes: { create: … } }`) is NOT stamped — the
 * nested row inherits its parent's tenant through the relation, and reaching into arbitrary nested
 * shapes here would mean re-implementing Prisma's input grammar.
 */
function withTenant(payload: unknown, tenantId: string): unknown {
  if (Array.isArray(payload)) return payload.map((row) => withTenant(row, tenantId));
  if (payload && typeof payload === "object") {
    const row = payload as Record<string, unknown>;
    return row["tenantId"] === undefined ? { ...row, tenantId } : row;
  }
  return payload;
}

function scopeArgs(args: unknown, operation: string, tenantId: string): unknown {
  const source = (args ?? {}) as Record<string, unknown>;
  const scoped: Record<string, unknown> = { ...source };

  if (WHERE_OPERATIONS.has(operation)) {
    const where = source["where"];
    scoped["where"] = { ...((where as Record<string, unknown> | undefined) ?? {}), tenantId };
  }
  for (const key of PAYLOAD_KEYS) {
    const payload = source[key];
    if (payload !== undefined && payload !== null) scoped[key] = withTenant(payload, tenantId);
  }
  return scoped;
}

/** One operation on one Prisma model delegate, as the extension API hands it to us: a runtime name
 *  and an argument object it has already validated. */
type DelegateOperation = (args: unknown) => Promise<unknown>;

/**
 * The delegate for `model` on a transaction client — `"AiUsageEvent"` to `tx.aiUsageEvent`.
 *
 * Prisma lowercases only the leading character when it derives a delegate name from a model name,
 * so this is the whole of the mapping.
 */
function delegateFor(
  tx: PrismaTransactionClient,
  model: string,
): Record<string, DelegateOperation> {
  const property = model.charAt(0).toLowerCase() + model.slice(1);
  // `TransactionClient`'s delegates are statically named while the extension reports the model as
  // a runtime string, so no type can express "the delegate for whatever model this call was for".
  // This is the single point where the runtime name meets the static client; everything downstream
  // is checked again by Prisma itself, which rejects an unknown operation or malformed args.
  const delegates = tx as unknown as Record<string, Record<string, DelegateOperation> | undefined>;
  const delegate = delegates[property];
  if (delegate === undefined) {
    throw new Error(`No Prisma delegate for model "${model}" (looked for "${property}")`);
  }
  return delegate;
}

/** Re-issue the intercepted operation against a transaction client that carries `app.tenant_id`. */
function invoke(
  tx: PrismaTransactionClient,
  model: string,
  operation: string,
  args: unknown,
): Promise<unknown> {
  const call = delegateFor(tx, model)[operation];
  if (call === undefined) {
    throw new Error(`Prisma delegate for "${model}" has no operation "${operation}"`);
  }
  return call(args);
}

/**
 * Run one scoped operation on a connection that has already announced its tenant.
 *
 * The RLS policies (6.6) read `app.tenant_id`, which only survives inside the transaction that set
 * it — see `tenant-connection.ts` for why the transaction pooler leaves no alternative. So this
 * never lets an operation reach the database bare:
 *
 *  - Inside `withTenantTransaction`, it reuses that transaction. N queries, one BEGIN/COMMIT.
 *  - Outside one, it opens a private transaction for this single operation. Correct, and slower:
 *    BEGIN, `set_config`, the query, COMMIT where an unscoped client would have sent one statement,
 *    and a pooled connection held for all four. That cost is the reason `withTenantTransaction`
 *    exists — a request that issues several queries should open one transaction rather than pay
 *    this per query.
 *
 * The alternative to paying it is a query that returns zero rows once RLS is on, which is not an
 * alternative.
 */
function runScoped(
  tenantId: string,
  model: string,
  operation: string,
  args: unknown,
): Promise<unknown> {
  const ambient = ambientTenantTransaction(tenantId);
  if (ambient !== undefined) return invoke(ambient, model, operation, args);

  return prisma.$transaction(async (tx) => {
    await setTenantIdOnConnection(tx, tenantId);
    return runWithAmbientTenantTransaction(tenantId, tx, () => invoke(tx, model, operation, args));
  });
}

/**
 * The enforcement seam (SAAS-RESTRUCTURE-PLAN 6.3). Returns a client that adds the active tenant
 * to every `where` and every write payload on every tenant-scoped model, so a repository cannot
 * forget to scope a query — the argument it would have to forget is the one it cannot compile
 * without.
 *
 * This is the primary control, not the only one: 6.6 adds Row-Level Security so a query that
 * somehow bypasses this extension returns zero rows rather than another tenant's data. Two
 * independent mechanisms, because a cross-tenant leak here is a disclosure of medical
 * professionals' PII.
 */
function extendedClient(tenantId: string | null) {
  return prisma.$extends({
    query: {
      $allModels: {
        async $allOperations({
          args,
          query,
          model,
          operation,
        }: {
          args: unknown;
          query: (args: unknown) => Promise<unknown>;
          model?: string;
          operation: string;
        }) {
          if (tenantId === null) return query(args);
          if (model === undefined || GLOBAL_MODELS.has(model)) return query(args);

          // Re-issued through `runScoped`, not `query`: `query` runs on the singleton client
          // outside any transaction, on a pooled connection with no `app.tenant_id` — and once
          // RLS is applied that reads as an empty table.
          return runScoped(tenantId, model, operation, scopeArgs(args, operation, tenantId));
        },
      },
    },
  });
}

/** A tenant-scoped client. */
export type ScopedClient = ReturnType<typeof extendedClient>;

/**
 * A tenant-scoped transaction client.
 *
 * NOTE, because the plan's sketch of this seam cannot compile: `Prisma.TransactionClient` has no
 * `$extends`, so `(tx ?? prisma).$extends(...)` is not available. The extension belongs on the base
 * client, and a transaction STARTED from a scoped client inherits it — which is the better property
 * anyway, since it means scoping cannot be lost by opening a transaction.
 */
export type ScopedTx = Omit<ScopedClient, "$connect" | "$disconnect" | "$transaction" | "$extends">;

/**
 * One extended client per tenant, not one per query.
 *
 * `db(ctx, tx)` is called at ~250 sites and `$extends` builds a fresh proxy client every time it
 * runs, so building one per call would put an allocation in front of every read in the app. The
 * closure captures the tenant id — a plain string — rather than the context object, so a cache hit
 * can never serve a client bound to a stale identity.
 */
const clientsByTenant = new Map<string, ScopedClient>();
let passThroughClient: ScopedClient | undefined;

export function scopedClientFor(ctx: TenantContext): ScopedClient {
  if (ctx === UNSCOPED_CONTEXT) return (passThroughClient ??= extendedClient(null));
  const cached = clientsByTenant.get(ctx.tenantId);
  if (cached) return cached;
  const created = extendedClient(ctx.tenantId);
  clientsByTenant.set(ctx.tenantId, created);
  return created;
}

/**
 * Either kind of transaction client. Only the global-model repositories should name this: their
 * models are in `GLOBAL_MODELS`, so a scoped client hands them through unchanged and insisting on
 * one kind would be a distinction without a difference.
 */
export type AnyTx = ScopedTx | PrismaTransactionClient;

export function db(ctx: TenantContext, tx?: ScopedTx): ScopedTx {
  return tx ?? scopedClientFor(ctx);
}

/**
 * The UNSCOPED client, for code that genuinely cannot name a tenant.
 *
 * 6.3 left this at ZERO uses: every repository takes a context, and the code above them that has
 * none yet goes through the bridge below instead, which is the hatch that has to shrink. This one
 * stays because platform-level work still to come — the Phase 7 ETL, the 6.8 admin plane — reads
 * across tenants by definition, and it is better for that to arrive through a named door than for
 * someone to reach for `prisma` directly.
 *
 * `scripts/check-tenant-scope.mjs` counts it with the rest, so the floor of zero holds: any new
 * use fails the build until it is added to the ratchet baseline deliberately.
 *
 * It is also the mechanism RLS is a backstop AGAINST: a query issued through here reaches Postgres
 * with no `app.tenant_id`, and once 6.6's migration is applied it returns zero rows for every
 * tenant-scoped table rather than another tenant's data. Callers still here will see empty results,
 * not wrong ones — which is the failure mode this design chose.
 */
export function dbUnscoped(tx?: AnyTx) {
  return tx ?? prisma;
}

/* --------------------------------------------------- the 6.3 → 6.4 bridge, deleted in 6.4 ---- */

/**
 * The context a caller passes when it has none yet — queries made through it are NOT tenant-scoped.
 *
 * 6.3 makes every repository method take a real `TenantContext`; 6.4 threads one down from the
 * guard through the 171 services that call them. Between those two commits the services have
 * nothing to pass, and the choice is either to weaken the repository signatures (which would
 * disarm the compiler check this phase exists to add) or to name the gap. This names it: the
 * signatures are strict, and every place still standing on pre-6.3 behaviour says so in one
 * greppable token that `scripts/check-tenant-scope.mjs` counts and refuses to let grow.
 *
 * It is deliberately not a usable identity — empty ids, so a caller that reaches for
 * `ctx.user.id` expecting a real actor gets an obviously wrong value rather than a plausible one.
 */
export const UNSCOPED_CONTEXT: TenantContext = Object.freeze({
  tenantId: "",
  membershipId: "",
  user: Object.freeze({ id: "", email: "", name: "" }),
  role: "Associate",
});

function isTenantContext(value: unknown): value is TenantContext {
  if (typeof value !== "object" || value === null) return false;
  // All four, because a repository argument could plausibly carry one of them alone: after 6.2 a
  // Prisma create payload has a `tenantId`. None carries a membership, a user and a role as well.
  return "tenantId" in value && "membershipId" in value && "user" in value && "role" in value;
}

/** The pre-6.3 signature of a repository method: the same call without the leading context. */
type WithoutContext<F> = F extends (ctx: TenantContext, ...rest: infer A) => infer R
  ? (...args: A) => R
  : F;

/**
 * A repository that accepts both the 6.3 signature and the one its un-threaded callers still use.
 * An intersection of two function types is an overload set, so both calls typecheck and neither
 * signature is loosened.
 */
export type UnscopedBridge<T> = { [K in keyof T]: T[K] & WithoutContext<T[K]> };

/**
 * Let callers that 6.4 has not reached yet keep calling a migrated repository unchanged.
 *
 * Without this, threading the repository layer would have to land together with the 171 services
 * above it — one diff no one can review — or the repository signatures would have to stay
 * optional, which is the thing 6.3 exists to end. Instead the repositories are strict today, the
 * services migrate file by file, and each call that still arrives without a context is served
 * unscoped exactly as it was before 6.3.
 *
 * DELETED IN 6.4, along with `UNSCOPED_CONTEXT`: once no caller relies on the short signature,
 * removing this line turns every remaining one into a compile error, which is how we will find
 * them.
 */
export function bridgeUnscopedCallers<T extends object>(repository: T): UnscopedBridge<T> {
  const bridged: Record<string, unknown> = {};
  for (const [name, member] of Object.entries(repository)) {
    if (typeof member !== "function") {
      bridged[name] = member;
      continue;
    }
    const method = member as (this: T, ...args: unknown[]) => unknown;
    // `apply` rather than a plain call: a method that reaches a sibling through `this` keeps
    // resolving to the strict object, so the bridge cannot turn a scoped internal call unscoped.
    bridged[name] = (...args: unknown[]) =>
      isTenantContext(args[0])
        ? method.apply(repository, args)
        : method.apply(repository, [UNSCOPED_CONTEXT, ...args]);
  }
  // The mapped type describes exactly what the loop above builds — one wrapper per method, each
  // callable with or without a leading context — but that correspondence is a fact about the loop,
  // not something `Object.entries` (which erases to `string`) can carry in its type.
  return bridged as UnscopedBridge<T>;
}
