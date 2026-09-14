import { prisma } from "./prisma";
import { withTenantTransaction } from "./tenant-transaction";
import type { ScopedTx } from "./tenant-scope";

/**
 * Re-exported, not reimplemented. Two versions of this existed after 6.3 and 6.6 were written in
 * parallel, and they differed in the one way that matters: only `tenant-transaction.ts` announces
 * the tenant on the connection with `set_config` before running anything. Without that, RLS reads
 * every tenant-scoped table as EMPTY — so the version that merely opened a transaction on the
 * scoped client was correct until the RLS migration lands and silently wrong the moment it does.
 */
export { withTenantTransaction };

/**
 * The pre-6.3 entry point, for services 6.4 has not threaded yet — the transaction it opens is
 * NOT tenant-scoped and announces no tenant. Counted by `scripts/check-tenant-scope.mjs`; deleted
 * once every caller has a context to pass.
 *
 * It deliberately does NOT go through `withTenantTransaction`: there is no tenant to announce, and
 * announcing a sentinel would make every statement inside read as empty under RLS rather than
 * behaving as it does today. Unscoped callers keep working until they are threaded, and then this
 * function disappears.
 */
export function withTransaction<T>(fn: (tx: ScopedTx) => Promise<T>): Promise<T> {
  return prisma.$transaction(fn as (tx: unknown) => Promise<T>) as Promise<T>;
}
