import { AsyncLocalStorage } from "node:async_hooks";
import type { Prisma as PrismaNs } from "./generated/prisma/client";
import { TENANT_SETTING } from "./tenant-models";

type PrismaTransactionClient = PrismaNs.TransactionClient;

/**
 * How a tenant identifies itself to Postgres, and why that is harder than it looks.
 *
 * THE PROBLEM — `SET LOCAL` UNDER A TRANSACTION POOLER
 *
 * The RLS policies read `current_setting('app.tenant_id')`. Something has to set it, and there are
 * only two ways to set a GUC on a connection:
 *
 *   `SET app.tenant_id = …`        — session scope. Survives until the connection closes.
 *   `SET LOCAL app.tenant_id = …`  — transaction scope. Reverts at COMMIT/ROLLBACK.
 *
 * The application connects through Supabase's TRANSACTION pooler (`prisma.ts`). In that mode a
 * server connection is bound to a client only for the duration of a transaction and is handed to
 * a different client the moment it commits. That makes the session-scoped form actively dangerous:
 * a plain `SET` writes tenant A's id onto a server connection that the pooler will lend to tenant
 * B's next statement, and B's query then passes A's RLS predicate. That is not a degraded control,
 * it is a cross-tenant read manufactured by the control itself.
 *
 * So the transaction-scoped form is mandatory. But `SET LOCAL` outside a transaction block is a
 * no-op that only emits a warning, and Prisma sends a standalone `findMany` outside any explicit
 * transaction. The setting would be discarded before the query ran, `current_setting(…, true)`
 * would return NULL, and every scoped table would look empty.
 *
 * THE CONCLUSION, STATED PLAINLY
 *
 * Under a transaction pooler there is no third option: every tenant-scoped query MUST run inside
 * an explicit transaction that sets `app.tenant_id` as its first statement. Nothing about the
 * pooler can be configured to make a bare query safe — the connection it lands on is chosen after
 * the statement is issued.
 *
 * WHAT THE CODE DOES ABOUT IT
 *
 * `tenant-scope.ts` does not assume callers remember. It routes every scoped operation through a
 * transaction, reusing the ambient one recorded here when there is one and opening a private one
 * when there is not. `withTenantTransaction` (`tenant-transaction.ts`) is how a caller opens the
 * ambient transaction and amortises it across many queries.
 *
 * WHY `set_config`, NOT `SET LOCAL`
 *
 * `SET LOCAL` is utility syntax and cannot take a bind parameter, so using it would mean pasting a
 * tenant id into SQL text. `set_config(name, value, is_local => true)` is the function form with
 * exactly the same semantics and takes parameters, so the id travels as data and never as SQL.
 */
interface AmbientTenantTransaction {
  readonly tenantId: string;
  readonly tx: PrismaTransactionClient;
}

const ambientStore = new AsyncLocalStorage<AmbientTenantTransaction>();

/**
 * Set `app.tenant_id` for the remainder of `tx`'s transaction.
 *
 * The third argument to `set_config` is `is_local`: true makes it revert at COMMIT, which is the
 * whole point — the pooled connection must carry no memory of this tenant once it is returned.
 */
export async function setTenantIdOnConnection(
  tx: PrismaTransactionClient,
  tenantId: string,
): Promise<void> {
  await tx.$queryRaw`SELECT set_config(${TENANT_SETTING}, ${tenantId}, true)`;
}

/**
 * The transaction that already carries `tenantId`, if this async context is inside one.
 *
 * Returns `undefined` when there is none, which tells the caller to open its own. Throws when the
 * ambient transaction belongs to a DIFFERENT tenant: `app.tenant_id` is a property of the
 * connection, so two tenants cannot share one transaction, and silently opening a nested one would
 * hold two connections from a pool sized for one — a deadlock under load. A tenant boundary
 * crossed mid-transaction is a bug, and it fails loudly here rather than intermittently in
 * production.
 */
export function ambientTenantTransaction(tenantId: string): PrismaTransactionClient | undefined {
  const ambient = ambientStore.getStore();
  if (ambient === undefined) return undefined;
  if (ambient.tenantId !== tenantId) {
    throw new Error(
      "Cross-tenant query inside a tenant transaction: the open transaction is bound to a " +
        "different tenant, and one connection can only carry one app.tenant_id.",
    );
  }
  return ambient.tx;
}

/** Record `tx` as the ambient tenant transaction for the duration of `fn`. */
export function runWithAmbientTenantTransaction<T>(
  tenantId: string,
  tx: PrismaTransactionClient,
  fn: () => Promise<T>,
): Promise<T> {
  return ambientStore.run({ tenantId, tx }, fn);
}

/**
 * The tenant this async context is operating on, if any.
 *
 * Read by code that must not build a tenant-agnostic artefact — object-storage keys, above all.
 * It is deliberately the same store the query path uses, so "which tenant is this work for" has
 * one answer and cannot drift between the row that is written and the file it points at.
 */
export function ambientTenantId(): string | undefined {
  return ambientStore.getStore()?.tenantId;
}
