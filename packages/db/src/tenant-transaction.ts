import type { TenantContext } from "@destaworks/domain/tenant";
import { prisma } from "./prisma";
import { db, type ScopedTx } from "./tenant-scope";
import { runWithAmbientTenantTransaction, setTenantIdOnConnection } from "./tenant-connection";

/** Interactive-transaction knobs, passed straight through to Prisma. */
export interface TenantTransactionOptions {
  /** How long the transaction may run before Prisma rolls it back. Prisma's default is 5s. */
  readonly timeout?: number;
  /** How long to wait for a free pooled connection before giving up. Prisma's default is 2s. */
  readonly maxWait?: number;
}

/**
 * Run `fn` inside ONE transaction that has announced its tenant to Postgres.
 *
 * This is the tenant-aware counterpart to `withTransaction`, and under RLS it is the shape every
 * request should have. Two things happen that cannot happen outside a transaction:
 *
 *  1. `app.tenant_id` is set with `set_config(…, is_local => true)`, so the RLS policies have
 *     something to compare against and the pooled connection reverts to carrying nothing the
 *     moment this commits. `tenant-connection.ts` explains why the session-scoped alternative is
 *     a cross-tenant leak rather than a shortcut.
 *  2. Every query `fn` issues through `db(ctx)` is routed onto THIS transaction instead of opening
 *     one of its own. A request that reads a candidate, its documents and its stage history pays
 *     one BEGIN/COMMIT rather than three.
 *
 * Atomicity comes along for free and is the lesser reason to reach for it: correctness under RLS
 * is the reason.
 *
 * The callback receives a scoped client, not a raw `Prisma.TransactionClient`, so a repository
 * called inside it still cannot issue an unscoped query.
 */
/**
 * Prisma's raw methods, which the tenant extension does NOT intercept.
 *
 * The seam extends `query.$allModels.$allOperations` — model operations only. A raw call therefore
 * bypasses it and, because `fn` is handed the extended CLIENT rather than the transaction, would
 * execute on a pooled connection OUTSIDE this transaction. That is not merely unscoped: anything
 * transaction-lifetime silently stops working. `pg_advisory_xact_lock` releases the instant the
 * implicit transaction ends, which turned the resume importer's duplicate-candidate guard into a
 * no-op that still looked like it was holding a lock.
 *
 * Raw calls are bound to the real transaction client instead. They stay unscoped — a raw query is
 * the caller's own SQL and the extension could not scope it anyway — but they now run on the
 * connection that announced the tenant, so RLS applies to them and a transaction-scoped lock is
 * actually held for the transaction.
 */
const RAW_METHODS = new Set(["$executeRaw", "$executeRawUnsafe", "$queryRaw", "$queryRawUnsafe"]);

function bindRawTo(tx: object, scoped: ScopedTx): ScopedTx {
  return new Proxy(scoped, {
    get(target, property, receiver) {
      if (typeof property === "string" && RAW_METHODS.has(property)) {
        const raw = Reflect.get(tx, property) as unknown;
        return typeof raw === "function" ? raw.bind(tx) : raw;
      }
      return Reflect.get(target, property, receiver) as unknown;
    },
  });
}

export function withTenantTransaction<T>(
  ctx: TenantContext,
  fn: (tx: ScopedTx) => Promise<T>,
  options?: TenantTransactionOptions,
): Promise<T> {
  return prisma.$transaction(
    async (tx) => {
      await setTenantIdOnConnection(tx, ctx.tenantId);
      return runWithAmbientTenantTransaction(ctx.tenantId, tx, () => fn(bindRawTo(tx, db(ctx))));
    },
    // `exactOptionalPropertyTypes` is on, so an explicit `undefined` is not the same as an absent
    // key — spreading the caller's options is how "unset means Prisma's default" stays true.
    { ...options },
  );
}
