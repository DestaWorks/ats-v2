import { describe, expect, it, vi } from "vitest";

/**
 * The property the fan-out batching depends on: a scoped query issued inside `withTenantTransaction`
 * joins the ambient transaction instead of opening its own. If this ever stops holding, every
 * batched fan-out silently reverts to one BEGIN/set_config/COMMIT per query against a pool of five,
 * and nothing else in the suite would notice.
 */
const h = vi.hoisted(() => ({ transactionsOpened: 0, statements: [] as string[] }));

vi.mock("./prisma", async () => {
  const { PrismaClient } = await import("./generated/prisma/client");
  const client = new PrismaClient({
    adapter: {
      provider: "postgres",
      adapterName: "test",
      connect: async () => ({
        provider: "postgres",
        adapterName: "test",
        queryRaw: async () => ({ columnNames: [], columnTypes: [], rows: [] }),
        executeRaw: async () => 0,
        startTransaction: async () => {
          h.transactionsOpened++;
          return {
            provider: "postgres",
            adapterName: "test",
            queryRaw: async () => ({ columnNames: [], columnTypes: [], rows: [] }),
            executeRaw: async () => 0,
            commit: async () => {},
            rollback: async () => {},
            options: { usePhantomQuery: true },
          };
        },
        dispose: async () => {},
      }),
    } as never,
  });
  const recorder = {
    query: {
      $allModels: {
        async $allOperations({
          model,
          operation,
          query,
          args,
        }: {
          model?: string;
          operation: string;
          query: (a: unknown) => Promise<unknown>;
          args: unknown;
        }) {
          h.statements.push(`${String(model)}.${operation}`);
          return query(args);
        },
      },
    },
  };
  return { prisma: client.$extends(recorder as never) };
});

const { db } = await import("./tenant-scope");
const { withTenantTransaction } = await import("./tenant-transaction");

const ctx = {
  tenantId: "t1",
  membershipId: "m1",
  role: "Owner" as const,
  user: { id: "u1", email: "u@desta.works", name: "U" },
};

describe("fan-out batching", () => {
  it("collapses a parallel fan-out onto ONE transaction", async () => {
    h.transactionsOpened = 0;
    h.statements.length = 0;

    await withTenantTransaction(ctx, async () => {
      await Promise.all([
        db(ctx).candidate.findMany({}),
        db(ctx).client.findMany({}),
        db(ctx).openRole.findMany({}),
      ]);
    });

    // Transactions, not statements: the extension observes each query twice (once on the way in,
    // once on the re-dispatch onto the ambient transaction) while the SQL executes once. What the
    // batching is for is the transaction count.
    expect(h.transactionsOpened).toBe(1);
  });

  it("without the wrapper, the same three reads open three", async () => {
    h.transactionsOpened = 0;
    await Promise.all([
      db(ctx).candidate.findMany({}),
      db(ctx).client.findMany({}),
      db(ctx).openRole.findMany({}),
    ]);

    expect(h.transactionsOpened).toBe(3);
  });
});
