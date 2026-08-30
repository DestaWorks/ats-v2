import { describe, it, expect, beforeEach, vi } from "vitest";
import type { TenantContext } from "@destaworks/domain/tenant";

/**
 * The enforcement seam (SAAS-RESTRUCTURE-PLAN 6.3), proven against REAL Prisma rather than a hand
 * -rolled stand-in — a fake `$extends` would only prove that the fake works.
 *
 * A real `PrismaClient` runs on a driver adapter that answers `BEGIN`/`COMMIT` and nothing else,
 * and a second query extension sits UNDER the tenant one to record the arguments it produced and
 * return without reaching the engine. So every assertion below is about what Prisma would actually
 * have been asked to execute, with no database anywhere.
 */

interface Recorded {
  model: string | undefined;
  operation: string;
  args: Record<string, unknown>;
}

const h = vi.hoisted(() => ({
  calls: [] as Recorded[],
  transactionsOpened: 0,
}));

vi.mock("./prisma", async () => {
  const { PrismaClient } = await import("./generated/prisma/client");

  const transaction = {
    provider: "postgres" as const,
    adapterName: "fake-adapter",
    options: { usePhantomQuery: true },
    queryRaw: async () => ({ columnTypes: [], columnNames: [], rows: [] }),
    executeRaw: async () => 0,
    commit: async () => {},
    rollback: async () => {},
  };
  const connection = {
    provider: "postgres" as const,
    adapterName: "fake-adapter",
    queryRaw: async () => ({ columnTypes: [], columnNames: [], rows: [] }),
    executeRaw: async () => 0,
    executeScript: async () => {},
    startTransaction: async () => {
      h.transactionsOpened++;
      return transaction;
    },
    dispose: async () => {},
  };
  const adapter = {
    provider: "postgres" as const,
    adapterName: "fake-adapter",
    connect: async () => connection,
  };

  // The fake satisfies `SqlDriverAdapterFactory` structurally; naming that type would mean
  // depending on @prisma/driver-adapter-utils, an internal package, for one line of test setup.
  type AdapterFactory = NonNullable<
    NonNullable<ConstructorParameters<typeof PrismaClient>[0]>["adapter"]
  >;
  const client = new PrismaClient({ adapter: adapter as AdapterFactory });

  // Records what the tenant extension actually asked Prisma to run, then returns WITHOUT calling
  // `query`, so the engine is never reached. Prisma runs query extensions outermost-first in the
  // order they were applied, so this has to go on AFTER the seam's own — which is why the module
  // hands back a `$extends` that wraps the seam's call rather than a plain client.
  const recordingExtension = {
    query: {
      $allModels: {
        async $allOperations({
          args,
          model,
          operation,
        }: {
          args: unknown;
          model?: string;
          operation: string;
        }) {
          h.calls.push({ model, operation, args: args as Record<string, unknown> });
          return operation === "create" || operation === "update" || operation === "findUnique"
            ? null
            : [];
        },
      },
    },
  };

  // `$extends` is a generic callable whose parameter type cannot be named from outside the
  // generated client, so both extensions are handed over opaquely. Nothing downstream depends on
  // the shape: the tests import their types from the real module, not from this mock.
  function extendsWrappingTheSeam(extension: never) {
    return client.$extends(extension).$extends(recordingExtension as never);
  }

  // The merged seam re-dispatches every scoped operation inside a transaction, because RLS reads
  // `app.tenant_id` off the connection and a statement outside a transaction has none. The fake
  // adapter has no real transactions, so this hands the callback the same extended client and
  // records the `set_config` the seam announces the tenant with — which is itself worth asserting.
  async function transactionOverTheFakeAdapter(fn: (tx: unknown) => Promise<unknown>) {
    h.transactionsOpened++;
    // A recording proxy rather than the extended client: after re-dispatch the seam calls
    // `tx[model][operation](args)` directly, so THIS is the boundary where the arguments Prisma
    // would actually execute are observable. Recording anywhere else records the pre-seam call.
    const tx = new Proxy(
      {
        $queryRaw: (strings: TemplateStringsArray, ...values: unknown[]) => {
          h.calls.push({
            model: "$raw",
            operation: "set_config",
            args: { sql: strings.join("?"), values } as Record<string, unknown>,
          });
          return Promise.resolve([]);
        },
      } as Record<string, unknown>,
      {
        get(target, prop: string) {
          if (prop in target) return target[prop];
          return new Proxy(
            {},
            {
              get: (_d, operation: string) => (args: Record<string, unknown>) => {
                h.calls.push({ model: prop, operation, args });
                return Promise.resolve(
                  operation === "create" || operation === "update" || operation === "findUnique"
                    ? null
                    : operation === "aggregate" || operation === "groupBy"
                      ? { _count: 0 }
                      : [],
                );
              },
            },
          );
        },
      },
    );
    return fn(tx);
  }

  return {
    prisma: { $extends: extendsWrappingTheSeam, $transaction: transactionOverTheFakeAdapter },
  };
});

const { db, scopedClientFor, scopedWrite, UNSCOPED_CONTEXT } = await import("./tenant-scope");
const { withTenantTransaction, withTransaction } = await import("./with-transaction");

const ctx: TenantContext = {
  tenantId: "tenant_a",
  membershipId: "m1",
  user: { id: "u1", email: "a@example.com", name: "A" },
  role: "Owner",
};

const last = () => h.calls[h.calls.length - 1]!;

beforeEach(() => {
  h.calls.length = 0;
  h.transactionsOpened = 0;
});

describe("nested reads are the seam's edge, and are documented as such", () => {
  it("stamps the top-level where and passes an `include` relation through verbatim", async () => {
    await db(ctx).openRole.findUnique({
      where: { id: "r1" },
      include: { client: { select: { matchProfile: true } } },
    });
    expect(last().args["where"]).toEqual({ id: "r1", tenantId: "tenant_a" });
    // NOT stamped, deliberately (see `withTenant`): a relation read is scoped by the foreign key
    // it follows and, independently, by the RLS policy on the joined table — which is evaluated on
    // the connection this very query announced its tenant on. Repositories that add an `include`
    // rely on those two, not on this extension.
    expect(last().args["include"]).toEqual({ client: { select: { matchProfile: true } } });
  });

  it("passes a relation filter inside `where` through verbatim as well", async () => {
    await db(ctx).outreachAttempt.findMany({ where: { lead: { promotedCandidateId: "c1" } } });
    expect(last().args["where"]).toEqual({
      lead: { promotedCandidateId: "c1" },
      tenantId: "tenant_a",
    });
  });
});

describe("reads carry the tenant filter", () => {
  it("adds tenantId to a findMany that had a where", async () => {
    await db(ctx).candidate.findMany({ where: { deletedAt: null } });
    expect(last().args["where"]).toEqual({ deletedAt: null, tenantId: "tenant_a" });
  });

  it("adds a where to a findMany that had none", async () => {
    await db(ctx).candidate.findMany({ orderBy: { name: "asc" } });
    expect(last().args["where"]).toEqual({ tenantId: "tenant_a" });
    expect(last().args["orderBy"]).toEqual({ name: "asc" });
  });

  it("scopes a findUnique, so an id from another tenant resolves to nothing", async () => {
    await db(ctx).candidate.findUnique({ where: { id: "c1" } });
    expect(last().args["where"]).toEqual({ id: "c1", tenantId: "tenant_a" });
  });

  it("scopes count, groupBy and deleteMany alike", async () => {
    await db(ctx).candidate.count({});
    expect(last().args["where"]).toEqual({ tenantId: "tenant_a" });
    await db(ctx).candidate.groupBy({ by: ["status"] });
    expect(last().args["where"]).toEqual({ tenantId: "tenant_a" });
    await db(ctx).candidate.deleteMany({ where: { deletedAt: { not: null } } });
    expect(last().args["where"]).toEqual({ deletedAt: { not: null }, tenantId: "tenant_a" });
  });

  it("does not mutate the caller's argument object", async () => {
    const args = { where: { deletedAt: null } };
    await db(ctx).candidate.findMany(args);
    expect(args).toEqual({ where: { deletedAt: null } });
  });
});

describe("writes get the tenant injected", () => {
  it("stamps tenantId on a create payload", async () => {
    await db(ctx).candidate.create({ data: scopedWrite({ name: "Ada" }) });
    expect(last().args["data"]).toEqual({ name: "Ada", tenantId: "tenant_a" });
  });

  it("adds no `where` to a create — Prisma rejects the argument outright", async () => {
    await db(ctx).candidate.create({ data: scopedWrite({ name: "Ada" }) });
    expect(last().args).not.toHaveProperty("where");
  });

  it("stamps every row of a createMany", async () => {
    await db(ctx).candidate.createMany({
      data: [scopedWrite({ name: "Ada" }), scopedWrite({ name: "Bea" })],
    });
    expect(last().args["data"]).toEqual([
      { name: "Ada", tenantId: "tenant_a" },
      { name: "Bea", tenantId: "tenant_a" },
    ]);
  });

  it("stamps BOTH halves of an upsert, so the insert branch cannot land untenanted", async () => {
    await db(ctx).dailyBrief.upsert({
      where: { tenantId_date: { tenantId: "tenant_a", date: "2026-08-29" } },
      create: scopedWrite({ date: "2026-08-29", headline: "x" }),
      update: { headline: "x" },
    });
    expect(last().args["where"]).toEqual({
      tenantId_date: { tenantId: "tenant_a", date: "2026-08-29" },
      tenantId: "tenant_a",
    });
    expect(last().args["create"]).toEqual({
      date: "2026-08-29",
      headline: "x",
      tenantId: "tenant_a",
    });
  });

  it("leaves an explicit tenantId alone rather than overwriting it", async () => {
    await db(ctx).candidate.create({ data: { name: "Ada", tenantId: "tenant_b" } });
    expect(last().args["data"]).toEqual({ name: "Ada", tenantId: "tenant_b" });
  });
});

describe("the global models are exempt", () => {
  it("leaves a User query untouched — one login spans every tenant", async () => {
    await db(ctx).user.findMany({ where: { id: { in: ["u1"] } } });
    expect(last().args["where"]).toEqual({ id: { in: ["u1"] } });
  });

  it("leaves Membership untouched — filtering it would hide the tenants a user can switch to", async () => {
    await db(ctx).membership.findMany({ where: { userId: "u1" } });
    expect(last().args["where"]).toEqual({ userId: "u1" });
  });

  it("leaves ScheduleRun untouched — the scheduler runs outside any tenant", async () => {
    await db(ctx).scheduleRun.deleteMany({ where: { schedule: "daily-brief" } });
    expect(last().args["where"]).toEqual({ schedule: "daily-brief" });
  });
});

describe("a transaction opened from a scoped client stays scoped", () => {
  it("scopes every statement inside withTenantTransaction", async () => {
    await withTenantTransaction(ctx, async (tx) => {
      await tx.candidate.findMany({ where: { deletedAt: null } });
      await tx.candidate.create({ data: scopedWrite({ name: "Ada" }) });
      await tx.activityLog.create({
        data: scopedWrite({ entity: "candidate", entityId: "c1", actor: "u1", action: "move" }),
      });
    });

    expect(h.transactionsOpened).toBe(1);

    // The tenant is announced on the connection FIRST — without it RLS reads the table as empty,
    // so the ordering is the guarantee, not an incidental detail.
    expect(h.calls[0]).toMatchObject({ model: "$raw", operation: "set_config" });
    expect(h.calls[0]!.args["values"]).toContain("tenant_a");

    const [read, write, audit] = h.calls.filter((call) => call.model !== "$raw");
    expect(read!.args["where"]).toEqual({ deletedAt: null, tenantId: "tenant_a" });
    expect(write!.args["data"]).toEqual({ name: "Ada", tenantId: "tenant_a" });
    expect(audit!.args["data"]).toMatchObject({ tenantId: "tenant_a" });
  });

  it("hands the repository layer a tx that `db(ctx, tx)` passes straight through, still scoped", async () => {
    await withTenantTransaction(ctx, async (tx) => {
      await db(ctx, tx).candidate.findMany({ where: { deletedAt: null } });
    });
    expect(last().args["where"]).toEqual({ deletedAt: null, tenantId: "tenant_a" });
  });

  it("rolls back and rethrows, without swallowing the tenant filter on the way", async () => {
    await expect(
      withTenantTransaction(ctx, async (tx) => {
        await tx.candidate.findMany({});
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect(last().args["where"]).toEqual({ tenantId: "tenant_a" });
  });
});

describe("the 6.3 -> 6.4 bridge", () => {
  it("does NOT scope — that is the whole point of counting it", async () => {
    await db(UNSCOPED_CONTEXT).candidate.findMany({ where: { deletedAt: null } });
    expect(last().args["where"]).toEqual({ deletedAt: null });
  });

  it("leaves withTransaction unscoped too, so 6.4 has something to find", async () => {
    await withTransaction(async (tx) => tx.candidate.findMany({}));
    expect(last().args["where"]).toBeUndefined();
  });
});

describe("client reuse", () => {
  it("builds one extended client per tenant, not one per query", () => {
    const other: TenantContext = { ...ctx, tenantId: "tenant_b" };
    expect(scopedClientFor(ctx)).toBe(scopedClientFor({ ...ctx }));
    expect(scopedClientFor(ctx)).not.toBe(scopedClientFor(other));
  });

  it("keys the cache on the tenant id, never on the context object", async () => {
    await db({
      ...ctx,
      membershipId: "m2",
      user: { id: "u2", email: "b@x", name: "B" },
    }).candidate.findMany({});
    expect(last().args["where"]).toEqual({ tenantId: "tenant_a" });
  });
});
