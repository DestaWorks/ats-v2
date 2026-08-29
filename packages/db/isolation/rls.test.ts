import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TENANT_SCOPED_MODELS, TENANT_SETTING } from "../src/tenant-models";
import { insertRow, rowId, topologicalOrder } from "./seed";

/**
 * Proof of isolation (SAAS-RESTRUCTURE-PLAN 6.7).
 *
 * WHAT THIS PROVES, AND WHY IT USES RAW SQL
 *
 * 6.6's done-when is that "a query that bypasses the extension returns zero rows rather than
 * another tenant's data". A suite that asked the enforcement seam whether the enforcement seam
 * works would prove the opposite of that sentence. So every query below goes to Postgres through
 * `pg` directly — no Prisma, no `db(ctx)`, no `tenantId` in any WHERE clause the test writes.
 * What stands between tenant A's connection and tenant B's rows here is Row-Level Security and
 * nothing else.
 *
 * WHY IT NEEDS A REAL DATABASE
 *
 * RLS is a database behaviour. A mocked client would assert that our own mock filters rows, which
 * is worth nothing. This suite therefore refuses to run against anything but a real Postgres, and
 * refuses to be skipped in CI — see the guard in `beforeAll`. CI gives it a throwaway service
 * container; `pnpm app:test-isolation` gives it whatever `ISOLATION_DATABASE_URL` points at.
 *
 * WHAT IT ASSERTS, PER TABLE, FOR ALL 39
 *
 *  1. A connection identified as tenant A sees A's row and only A's row.
 *  2. A connection identified as tenant A cannot fetch B's row BY ITS PRIMARY KEY. This is the
 *     cross-tenant read the seam is meant to prevent, issued the way it would arrive if the seam
 *     were bypassed — an explicit id, no tenant filter.
 *  3. A connection identified as tenant A cannot UPDATE B's row.
 *  4. A connection that never announced a tenant sees nothing at all. RLS fails CLOSED: an
 *     unscoped query is empty, never universal.
 *  5. A connection identified as tenant A cannot INSERT a row labelled tenant B (WITH CHECK).
 *
 * And one test proves the other 195 are load-bearing, by dropping a policy and watching the same
 * query start returning another tenant's data.
 */

const TABLES = TENANT_SCOPED_MODELS.map((m) => m.table);
const TENANT_A = "tenant_a";
const TENANT_B = "tenant_b";

let client: Client;

/**
 * Run `fn` on a connection that has announced `tenantId` for exactly one transaction.
 *
 * This is the shape `withTenantTransaction` produces at runtime, reproduced here in raw SQL so the
 * suite is testing the database's behaviour rather than our wrapper's. `set_config(…, true)` is
 * `SET LOCAL`: it reverts at COMMIT, so the connection carries nothing into the next test — the
 * same property that makes it safe under a transaction pooler.
 */
async function asTenant<T>(tenantId: string, fn: () => Promise<T>): Promise<T> {
  await client.query("BEGIN");
  try {
    await client.query("SELECT set_config($1, $2, true)", [TENANT_SETTING, tenantId]);
    const result = await fn();
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

/** Run `fn` in a transaction that never says who it is. */
async function asNobody<T>(fn: () => Promise<T>): Promise<T> {
  await client.query("BEGIN");
  try {
    const result = await fn();
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

async function ids(table: string): Promise<string[]> {
  const result = await client.query<{ id: string }>(`SELECT "id" FROM "${table}" ORDER BY "id"`);
  return result.rows.map((r) => r.id);
}

async function seedTenant(tenant: string, suffix: string, ordered: readonly string[]) {
  // Seeding runs as the tenant, so the WITH CHECK half of every policy is exercised 39 times
  // before a single assertion runs: if a policy rejected its own tenant's write, this fails here.
  await asTenant(tenant, async () => {
    for (const table of ordered) {
      await insertRow(client, table, suffix, { id: rowId(table, suffix), tenantId: tenant }, (p) =>
        p === "tenants" ? tenant : p === "user" ? `user__${suffix}` : rowId(p, suffix),
      );
    }
  });
}

beforeAll(async () => {
  const connectionString = process.env.ISOLATION_DATABASE_URL;
  if (connectionString === undefined || connectionString === "") {
    // Never a silent skip in CI. A required check that passes without a database is worse than no
    // check, because it reads as proof.
    throw new Error(
      "ISOLATION_DATABASE_URL is not set. The isolation suite needs a real, throwaway Postgres — " +
        "run `pnpm app:test-isolation`, which starts one and applies the migrations to it.",
    );
  }

  client = new Client({ connectionString });
  await client.connect();

  // Global tables first: they are outside RLS and every tenant-scoped row points at them.
  for (const tenant of [TENANT_A, TENANT_B]) {
    const suffix = tenant === TENANT_A ? "a" : "b";
    await insertRow(
      client,
      "tenants",
      suffix,
      { id: tenant, slug: tenant, name: tenant },
      () => undefined,
    );
    await insertRow(
      client,
      "user",
      suffix,
      { id: `user__${suffix}`, email: `${suffix}@isolation.test` },
      () => undefined,
    );
  }

  const ordered = await topologicalOrder(client, TABLES);
  await seedTenant(TENANT_A, "a", ordered);
  await seedTenant(TENANT_B, "b", ordered);
}, 120_000);

afterAll(async () => {
  await client?.end();
});

describe("RLS covers every tenant-scoped table", () => {
  /**
   * Before anything else: prove this connection is one that policies apply to.
   *
   * Postgres exempts superusers and `BYPASSRLS` roles from every policy, and exempts a table's
   * owner unless the table is `FORCE`d. Run as a superuser, every other test in this file passes
   * with the policies doing nothing — and keeps passing after they are deleted. The first run of
   * this suite did exactly that, which is why the assertion is here and not in a comment.
   *
   * It is also the production requirement in miniature: the role in `DATABASE_URL` must be neither
   * a superuser nor `BYPASSRLS`, or the whole of 6.6 is decoration.
   */
  it("runs as a role that row-level security actually applies to", async () => {
    const role = await client.query<{ rolsuper: boolean; rolbypassrls: boolean; name: string }>(
      `SELECT current_user AS name, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user`,
    );
    const attributes = role.rows[0];
    expect(attributes, "the connecting role exists").toBeDefined();
    expect(attributes?.rolsuper, `${attributes?.name} must not be a superuser`).toBe(false);
    expect(attributes?.rolbypassrls, `${attributes?.name} must not have BYPASSRLS`).toBe(false);
  });

  it("has a forced policy on all 39, so the table owner is bound by it too", async () => {
    const result = await client.query<{ relname: string; relrowsecurity: boolean; f: boolean }>(
      `SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity AS f
       FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND c.relname = ANY($1)`,
      [[...TABLES]],
    );
    expect(result.rows).toHaveLength(TABLES.length);
    for (const row of result.rows) {
      expect(row.relrowsecurity, `${row.relname} has RLS enabled`).toBe(true);
      // Without FORCE the application's own role — which owns these tables on Supabase — is
      // exempt from every policy, and all of this proves nothing about production.
      expect(row.f, `${row.relname} has RLS forced`).toBe(true);
    }
  });

  it("covers exactly the tables the schema says are tenant-scoped", async () => {
    const withPolicy = await client.query<{ tablename: string }>(
      `SELECT tablename FROM pg_policies WHERE schemaname = 'public' AND policyname = 'tenant_isolation'`,
    );
    expect(withPolicy.rows.map((r) => r.tablename).sort()).toEqual([...TABLES].sort());
  });
});

describe.each(TENANT_SCOPED_MODELS)("$model ($table)", ({ table }) => {
  const aRow = rowId(table, "a");
  const bRow = rowId(table, "b");

  it("shows tenant A only its own row", async () => {
    const visible = await asTenant(TENANT_A, () => ids(table));
    expect(visible).toEqual([aRow]);
  });

  it("hides tenant B's row from tenant A even when asked for by primary key", async () => {
    const found = await asTenant(TENANT_A, async () => {
      const result = await client.query(`SELECT "id" FROM "${table}" WHERE "id" = $1`, [bRow]);
      return result.rowCount;
    });
    expect(found).toBe(0);
  });

  it("refuses tenant A an UPDATE of tenant B's row", async () => {
    const updated = await asTenant(TENANT_A, async () => {
      const result = await client.query(
        `UPDATE "${table}" SET "tenantId" = "tenantId" WHERE "id" = $1`,
        [bRow],
      );
      return result.rowCount;
    });
    expect(updated).toBe(0);
  });

  it("shows nothing at all to a connection that never announced a tenant", async () => {
    const visible = await asNobody(() => ids(table));
    expect(visible).toEqual([]);
  });

  it("refuses tenant A an INSERT labelled tenant B", async () => {
    await expect(
      asTenant(TENANT_A, () =>
        insertRow(client, table, "a", { id: `${table}__smuggled`, tenantId: TENANT_B }, (p) =>
          p === "tenants" ? TENANT_B : p === "user" ? "user__b" : rowId(p, "b"),
        ),
      ),
      // Postgres answers a WITH CHECK failure with 42501, the same code as any other policy
      // violation. The row must not exist afterwards either, which the first test re-proves on
      // the next run against a fresh database.
    ).rejects.toMatchObject({ code: "42501" });
  });
});

describe("the assertions above are load-bearing", () => {
  /**
   * A negative control.
   *
   * Every test above passes if the tables are empty, if the ids are wrong, or if some future
   * refactor quietly points the suite at nothing. This one fails in all of those cases, because it
   * asserts that WEAKENING the protection CHANGES the answer: add a policy missing the tenant
   * predicate — the single most likely way to get this wrong — and the identical query that
   * returned zero rows returns tenant B's row, with tenant B's row proven to be really there.
   *
   * It weakens rather than drops, because dropping the last policy makes an RLS-enabled table
   * deny everything: the query would still return zero rows and the control would prove nothing.
   * Postgres ORs permissive policies together, so `USING (true)` alongside the real one is exactly
   * "somebody wrote a policy that forgot the tenant".
   *
   * Without this, "the suite is green" and "the suite is looking at a real, populated, protected
   * table" are two different statements, and only the first one would be checked.
   */
  it("catches a cross-tenant read the moment the policy stops naming the tenant", async () => {
    const readBRow = () =>
      asTenant(TENANT_A, async () => {
        const result = await client.query<{ id: string }>(
          `SELECT "id" FROM "candidates" WHERE "id" = $1`,
          [rowId("candidates", "b")],
        );
        return result.rows.map((r) => r.id);
      });

    expect(await readBRow()).toEqual([]);

    await client.query(`CREATE POLICY "tenant_isolation_weakened" ON "candidates" USING (true)`);
    try {
      expect(await readBRow()).toEqual([rowId("candidates", "b")]);
    } finally {
      await client.query(`DROP POLICY "tenant_isolation_weakened" ON "candidates"`);
    }

    expect(await readBRow()).toEqual([]);
  });

  /**
   * The other half of the same worry: a policy is only as good as the setting it reads. If the
   * application set a name the policy does not read — a typo, a rename, a second GUC introduced by
   * a well-meaning refactor — every table would silently look empty and someone would "fix" it by
   * loosening the policy.
   */
  it("reads the same setting name the application writes", async () => {
    const definition = await client.query<{ qual: string }>(
      `SELECT qual FROM pg_policies WHERE schemaname='public' AND tablename='candidates' AND policyname='tenant_isolation'`,
    );
    expect(definition.rows[0]?.qual).toContain(TENANT_SETTING);
  });
});
