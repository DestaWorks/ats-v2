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
export function withTenantTransaction<T>(
  ctx: TenantContext,
  fn: (tx: ScopedTx) => Promise<T>,
  options?: TenantTransactionOptions,
): Promise<T> {
  return prisma.$transaction(
    async (tx) => {
      await setTenantIdOnConnection(tx, ctx.tenantId);
      return runWithAmbientTenantTransaction(ctx.tenantId, tx, () => fn(db(ctx)));
    },
    // `exactOptionalPropertyTypes` is on, so an explicit `undefined` is not the same as an absent
    // key — spreading the caller's options is how "unset means Prisma's default" stays true.
    { ...options },
  );
}
