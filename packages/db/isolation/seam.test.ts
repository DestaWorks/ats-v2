import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { TenantContext } from "@destaworks/domain/tenant";
import { db, dbUnscoped, scopedWrite } from "../src/tenant-scope";
import { withTenantTransaction } from "../src/tenant-transaction";

/**
 * The other half of 6.7: the application's own path, end to end, against the same real Postgres.
 *
 * `rls.test.ts` proves the database refuses a cross-tenant read to a connection that bypasses the
 * seam. This proves the complementary thing, which is just as easy to get wrong and much easier to
 * miss: that the seam's queries SUCCEED under those same policies.
 *
 * That is not obvious. RLS reads `app.tenant_id`, which only exists inside the transaction that set
 * it, and Prisma issues a standalone `findMany` outside any transaction. If `tenant-scope.ts` had
 * simply called `query(args)` — as the plan's sketch does — every one of these reads would return
 * an empty array against a fully populated database, and no amount of raw-SQL testing would have
 * shown it. The tests below are what stands between that design and production.
 */

const TENANT_A = "seam_tenant_a";
const TENANT_B = "seam_tenant_b";

function context(tenantId: string): TenantContext {
  return {
    tenantId,
    membershipId: `membership_${tenantId}`,
    user: { id: `user_${tenantId}`, email: `${tenantId}@seam.test`, name: "Seam" },
    role: "Owner",
  };
}

let admin: Client;
let candidateA: string;
let candidateB: string;

beforeAll(async () => {
  const connectionString = process.env.ISOLATION_DATABASE_URL;
  if (connectionString === undefined || connectionString === "") {
    throw new Error("ISOLATION_DATABASE_URL is not set — run `pnpm app:test-isolation`.");
  }
  admin = new Client({ connectionString });
  await admin.connect();

  // `tenants` is global, so it is outside RLS and can be seeded directly.
  for (const tenant of [TENANT_A, TENANT_B]) {
    await admin.query(
      `INSERT INTO "tenants" ("id", "slug", "name", "updatedAt") VALUES ($1, $1, $1, now())
       ON CONFLICT ("id") DO NOTHING`,
      [tenant],
    );
  }

  // Written through the seam, which is itself the first assertion: a create must satisfy the
  // policy's WITH CHECK, and it can only do that if the extension injected the tenant AND the
  // insert ran on a connection that had announced it.
  const a = await db(context(TENANT_A)).candidate.create({
    data: scopedWrite({ name: "Tenant A candidate" }),
  });
  const b = await db(context(TENANT_B)).candidate.create({
    data: scopedWrite({ name: "Tenant B candidate" }),
  });
  candidateA = a.id;
  candidateB = b.id;
}, 120_000);

afterAll(async () => {
  await admin?.end();
});

describe("the enforcement seam works under RLS", () => {
  it("reads its own tenant's rows — not an empty table", async () => {
    const rows = await db(context(TENANT_A)).candidate.findMany({});
    expect(rows.map((r) => r.id)).toContain(candidateA);
    expect(rows.map((r) => r.id)).not.toContain(candidateB);
  });

  it("stamps the tenant on a create without the caller passing one", async () => {
    const row = await db(context(TENANT_A)).candidate.findUniqueOrThrow({
      where: { id: candidateA },
    });
    expect(row.tenantId).toBe(TENANT_A);
  });

  it("cannot reach the other tenant's row by id", async () => {
    const row = await db(context(TENANT_A)).candidate.findUnique({ where: { id: candidateB } });
    expect(row).toBeNull();
  });

  it("cannot update the other tenant's row", async () => {
    const result = await db(context(TENANT_A)).candidate.updateMany({
      where: { id: candidateB },
      data: { name: "overwritten" },
    });
    expect(result.count).toBe(0);
    const untouched = await db(context(TENANT_B)).candidate.findUniqueOrThrow({
      where: { id: candidateB },
    });
    expect(untouched.name).toBe("Tenant B candidate");
  });

  it("counts and aggregates within the tenant", async () => {
    const count = await db(context(TENANT_A)).candidate.count({});
    const total = await dbUnscoped().candidate.count({});
    expect(count).toBeGreaterThan(0);
    // The unscoped client has no `app.tenant_id`, so RLS answers it with zero — the fail-closed
    // behaviour, seen from the application side. Callers still on `dbUnscoped` get empty results,
    // never another tenant's.
    expect(total).toBe(0);
  });

  it("runs many queries in one transaction when the caller opens one", async () => {
    const ctx = context(TENANT_A);
    const result = await withTenantTransaction(ctx, async (tx) => {
      const created = await tx.candidate.create({ data: scopedWrite({ name: "In transaction" }) });
      const found = await tx.candidate.findUniqueOrThrow({ where: { id: created.id } });
      const invisible = await tx.candidate.findUnique({ where: { id: candidateB } });
      return { found, invisible };
    });
    expect(result.found.tenantId).toBe(TENANT_A);
    expect(result.invisible).toBeNull();
  });

  it("rolls the whole transaction back on a throw", async () => {
    const ctx = context(TENANT_A);
    const before = await db(ctx).candidate.count({});
    await expect(
      withTenantTransaction(ctx, async (tx) => {
        await tx.candidate.create({ data: scopedWrite({ name: "Doomed" }) });
        throw new Error("deliberate");
      }),
    ).rejects.toThrow("deliberate");
    expect(await db(ctx).candidate.count({})).toBe(before);
  });

  it("refuses to serve a second tenant from inside another tenant's transaction", async () => {
    // One connection carries one `app.tenant_id`. Answering here would run tenant B's query under
    // tenant A's policy; opening a nested transaction would hold two connections from a pool sized
    // for one. It throws instead.
    await expect(
      withTenantTransaction(context(TENANT_A), async () =>
        db(context(TENANT_B)).candidate.findMany({}),
      ),
    ).rejects.toThrow(/Cross-tenant query/);
  });

  it("leaves global models alone", async () => {
    // `Tenant` is in GLOBAL_MODELS, so the seam must not add a `tenantId` filter to it — a user
    // with two memberships has to be able to see both tenants.
    const tenants = await db(context(TENANT_A)).tenant.findMany({
      where: { id: { in: [TENANT_A, TENANT_B] } },
    });
    expect(tenants.map((t) => t.id).sort()).toEqual([TENANT_A, TENANT_B].sort());
  });
});
