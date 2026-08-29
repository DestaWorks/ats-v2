import { prisma } from "./prisma";
import type { Prisma as PrismaNs } from "./generated/prisma/client";

type PrismaTransactionClient = PrismaNs.TransactionClient;
import type { TenantContext } from "@destaworks/domain/tenant";

/**
 * Models that exist OUTSIDE any tenant, and must never have a `tenantId` injected into a query.
 *
 * `User` is the interesting one: one human has one login and may belong to many tenants, so the
 * user row is global and the tenant-specific facts (role, status) live on `Membership`. The three
 * Better Auth tables hang off the user for the same reason. `ScheduleRun` is platform
 * infrastructure — one claim per (schedule, occurrence) for the whole install, written by a
 * scheduler that runs outside any request.
 *
 * `Tenant` and `Membership` are themselves global: a query that filtered memberships by the active
 * tenant could never answer "which tenants may this user switch to".
 */
const GLOBAL_MODELS: ReadonlySet<string> = new Set([
  "User",
  "Session",
  "Account",
  "Verification",
  "ScheduleRun",
  "Tenant",
  "Membership",
]);

function injectTenant(data: unknown, tenantId: string): void {
  if (Array.isArray(data)) {
    for (const row of data) injectTenant(row, tenantId);
    return;
  }
  if (data && typeof data === "object") {
    const row = data as Record<string, unknown>;
    if (row["tenantId"] === undefined) row["tenantId"] = tenantId;
  }
}

/**
 * The enforcement seam (SAAS-RESTRUCTURE-PLAN 6.3). Returns a client that adds the active tenant
 * to every `where` and every `data` on every tenant-scoped model, so a repository cannot forget to
 * scope a query — the argument it would have to forget is the one it cannot compile without.
 *
 * This is the primary control, not the only one: 6.6 adds Row-Level Security so a query that
 * somehow bypasses this extension returns zero rows rather than another tenant's data. Two
 * independent mechanisms, because a cross-tenant leak here is a disclosure of medical
 * professionals' PII.
 */
function scopedClient(ctx: TenantContext) {
  return prisma.$extends({
    query: {
      $allModels: {
        async $allOperations({
          args,
          query,
          model,
        }: {
          args: unknown;
          query: (args: unknown) => Promise<unknown>;
          model?: string;
        }) {
          if (model !== undefined && GLOBAL_MODELS.has(model)) return query(args);

          const scoped = args as { where?: Record<string, unknown>; data?: unknown };
          scoped.where = { ...(scoped.where ?? {}), tenantId: ctx.tenantId };
          if (scoped.data !== undefined && scoped.data !== null) {
            injectTenant(scoped.data, ctx.tenantId);
          }
          return query(args);
        },
      },
    },
  });
}

/** A tenant-scoped client. */
export type ScopedClient = ReturnType<typeof scopedClient>;

/**
 * A tenant-scoped transaction client.
 *
 * NOTE, because the plan's sketch of this seam cannot compile: `Prisma.TransactionClient` has no
 * `$extends`, so `(tx ?? prisma).$extends(...)` is not available. The extension belongs on the base
 * client, and a transaction STARTED from a scoped client inherits it — which is the better property
 * anyway, since it means scoping cannot be lost by opening a transaction.
 */
export type ScopedTx = Omit<ScopedClient, "$connect" | "$disconnect" | "$transaction" | "$extends">;

export function db(ctx: TenantContext, tx?: ScopedTx): ScopedTx {
  return tx ?? scopedClient(ctx);
}

/**
 * The UNSCOPED client, for code not yet migrated to `db(ctx, tx)`.
 *
 * Phase 6.3 threads a `TenantContext` through 249 call sites across 38 repositories and the
 * services above them. Doing that in one commit would be one unreviewable diff; doing it with a
 * temporarily-optional context would mean the compiler stops catching the thing this phase exists
 * to catch. So the seam is strict from the start and this is the explicit, countable exception.
 *
 * `scripts/check-tenant-scope.mjs` ratchets the number of remaining uses downward. When it reaches
 * zero this function is deleted, and the type system alone guarantees every query is scoped.
 */
export function dbUnscoped(tx?: PrismaTransactionClient) {
  return tx ?? prisma;
}
