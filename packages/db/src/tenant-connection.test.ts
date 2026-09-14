import { describe, expect, it, vi } from "vitest";
import type { Prisma as PrismaNs } from "./generated/prisma/client";
import {
  ambientTenantId,
  ambientTenantTransaction,
  runWithAmbientTenantTransaction,
  setTenantIdOnConnection,
} from "./tenant-connection";

type PrismaTransactionClient = PrismaNs.TransactionClient;

/**
 * A transaction client that records the tagged-template call instead of making it.
 *
 * The full `TransactionClient` is 39 delegates plus the raw helpers; these tests exercise one
 * method, so the cast is to a stand-in that implements exactly the surface under test.
 */
function fakeTx(queryRaw = vi.fn()): { tx: PrismaTransactionClient; queryRaw: typeof queryRaw } {
  const stub = { $queryRaw: queryRaw };
  return { tx: stub as unknown as PrismaTransactionClient, queryRaw };
}

describe("setTenantIdOnConnection", () => {
  it("sets the tenant transaction-locally, never for the session", async () => {
    const { tx, queryRaw } = fakeTx();
    await setTenantIdOnConnection(tx, "tenant-1");

    const [strings] = queryRaw.mock.calls[0] ?? [];
    const sql = (strings as readonly string[]).join("?");
    expect(sql).toContain("set_config");
    // The third argument is `is_local`. `true` means the setting reverts at COMMIT — which is the
    // only thing that makes it safe on a connection a transaction pooler will lend to someone
    // else the moment this transaction ends. A session-scoped SET here would be a cross-tenant
    // leak manufactured by the control itself.
    expect(sql).toContain("true");
  });

  it("passes the tenant id as a bind parameter, never as SQL text", async () => {
    const { tx, queryRaw } = fakeTx();
    await setTenantIdOnConnection(tx, "tenant-1");

    const [strings, ...values] = queryRaw.mock.calls[0] ?? [];
    expect(values).toContain("tenant-1");
    // `SET LOCAL` cannot take a parameter, so using it would mean pasting the id into SQL. This
    // asserts we did not.
    for (const fragment of strings as readonly string[]) {
      expect(fragment).not.toContain("tenant-1");
    }
  });
});

describe("ambientTenantTransaction", () => {
  it("is undefined outside a tenant transaction, so the caller opens its own", () => {
    expect(ambientTenantTransaction("tenant-1")).toBeUndefined();
    expect(ambientTenantId()).toBeUndefined();
  });

  it("hands back the open transaction for the same tenant", async () => {
    const { tx } = fakeTx();
    await runWithAmbientTenantTransaction("tenant-1", tx, async () => {
      expect(ambientTenantTransaction("tenant-1")).toBe(tx);
      expect(ambientTenantId()).toBe("tenant-1");
    });
  });

  it("refuses to serve a different tenant from an open transaction", async () => {
    const { tx } = fakeTx();
    await runWithAmbientTenantTransaction("tenant-1", tx, async () => {
      // One connection carries one `app.tenant_id`. Quietly opening a nested transaction would
      // hold two connections from a pool sized for one; answering from this one would run tenant
      // 2's query under tenant 1's policy. Neither is acceptable, so it throws.
      expect(() => ambientTenantTransaction("tenant-2")).toThrowError(/Cross-tenant query/);
    });
  });

  it("does not leak the transaction to work that follows it", async () => {
    const { tx } = fakeTx();
    await runWithAmbientTenantTransaction("tenant-1", tx, async () => undefined);
    expect(ambientTenantTransaction("tenant-1")).toBeUndefined();
  });
});
