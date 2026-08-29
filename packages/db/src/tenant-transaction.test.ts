import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * The raw-call escape. `withTenantTransaction` hands its callback a scoped CLIENT, and the tenant
 * extension covers `$allModels` only — so before this was fixed, a `$executeRaw` inside a tenant
 * transaction ran on a pooled connection outside it. Model writes still committed correctly, which
 * is what made it invisible: the only symptom was that anything transaction-lifetime stopped
 * working, and `pg_advisory_xact_lock` releasing immediately turned the resume importer's
 * duplicate-candidate guard into a no-op that still read like a lock.
 */
const h = vi.hoisted(() => ({
  rawOnTransaction: [] as string[],
  rawOnBaseClient: [] as string[],
  txClient: undefined as unknown,
}));

vi.mock("./prisma", () => {
  const tx = {
    $executeRaw: (strings: TemplateStringsArray) => {
      h.rawOnTransaction.push(strings.join("?"));
      return Promise.resolve(1);
    },
    $queryRaw: () => Promise.resolve([]),
  };
  h.txClient = tx;
  return {
    prisma: {
      $transaction: async (fn: (client: unknown) => Promise<unknown>) => fn(tx),
      $extends: () => ({
        $executeRaw: (strings: TemplateStringsArray) => {
          h.rawOnBaseClient.push(strings.join("?"));
          return Promise.resolve(1);
        },
        candidate: { findMany: () => Promise.resolve([]) },
      }),
    },
  };
});

vi.mock("./tenant-connection", () => ({
  setTenantIdOnConnection: () => Promise.resolve(),
  runWithAmbientTenantTransaction: (_id: string, _tx: unknown, run: () => unknown) => run(),
  ambientTenantTransaction: () => h.txClient,
}));

const { withTenantTransaction } = await import("./tenant-transaction");

const ctx = {
  tenantId: "tenant_a",
  membershipId: "m1",
  role: "Owner" as const,
  user: { id: "u1", email: "u@desta.works", name: "U" },
};

describe("withTenantTransaction — raw calls", () => {
  beforeEach(() => {
    h.rawOnTransaction.length = 0;
    h.rawOnBaseClient.length = 0;
  });

  it("runs a raw statement ON the transaction, not on a pooled connection beside it", async () => {
    await withTenantTransaction(ctx, async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"k"}))`;
    });

    expect(h.rawOnTransaction).toHaveLength(1);
    expect(h.rawOnTransaction[0]).toContain("pg_advisory_xact_lock");
    // The whole point: nothing reached the base client, which is where it used to go.
    expect(h.rawOnBaseClient).toEqual([]);
  });

  it("still routes model operations through the scoped client", async () => {
    await withTenantTransaction(ctx, async (tx) => {
      await tx.candidate.findMany({});
    });

    expect(h.rawOnTransaction).toEqual([]);
  });
});
