import "dotenv/config";

import { prisma } from "../packages/db/src/prisma";
import {
  describeFinding,
  reconcileTenants,
  type TableCounts,
} from "../packages/db/src/tenant-reconciliation";
import {
  FOUNDING_TENANT_ID,
  TENANT_SCOPED_TABLE_BY_DELEGATE,
  type TenantScopedTable,
} from "../packages/db/src/tenant-tables";

/**
 * Phase 6.2's done-when: prove every row belongs to exactly one tenant. `pnpm tenant:reconcile`.
 *
 * READ-ONLY. It counts and it prints; it writes nothing and it migrates nothing. Run it between
 * `20260829112000_tenants_backfill` and `20260829112500_tenants_contract` — the contract migration
 * would abort on an unbackfilled row anyway, but it aborts with a constraint violation on one
 * table, while this names every offending table and how many rows, before the window opens.
 *
 * The decisions live in `packages/db/src/tenant-reconciliation.ts` and are unit-tested there. This
 * file is only the part that cannot be tested without a database: reading the counts.
 *
 * `--allow-many-tenants` drops the "everything belongs to tenant #1" expectation, for once the
 * installation genuinely serves several. The other two invariants — no orphans, no dangling
 * tenant references — hold in both worlds and are always checked.
 */

const allowManyTenants = process.argv.includes("--allow-many-tenants");

/**
 * Prisma exposes one delegate per model and they do not share a base type the compiler can name
 * from outside, so the three operations this script needs are declared structurally. Narrower than
 * `any` and checked at the call site: a delegate missing one of them fails to compile.
 */
interface CountableDelegate {
  count(args?: { where?: { tenantId?: null | { notIn: string[] } } }): Promise<number>;
  groupBy(args: {
    by: ["tenantId"];
    _count: { _all: true };
  }): Promise<{ tenantId: string | null; _count: { _all: number } }[]>;
}

async function countsFor(
  delegate: CountableDelegate,
  table: TenantScopedTable,
  knownTenantIds: string[],
): Promise<TableCounts> {
  const [total, orphaned, dangling, grouped] = await Promise.all([
    delegate.count(),
    delegate.count({ where: { tenantId: null } }),
    // `notIn` over the known ids rather than a join: it asks the question directly ("which rows
    // name a tenant that is not one of these") and needs no relation to be loaded.
    knownTenantIds.length > 0
      ? delegate.count({ where: { tenantId: { notIn: knownTenantIds } } })
      : Promise.resolve(0),
    delegate.groupBy({ by: ["tenantId"], _count: { _all: true } }),
  ]);

  const byTenant: Record<string, number> = {};
  for (const row of grouped) {
    if (row.tenantId === null) continue; // counted as `orphaned`, not as a tenant
    byTenant[row.tenantId] = row._count._all;
  }

  return { table, total, orphaned, dangling, byTenant };
}

async function main() {
  const tenants = await prisma.tenant.findMany({ select: { id: true } });
  const knownTenantIds = tenants.map((tenant) => tenant.id);

  // The client is indexed by delegate name here because that is the only way to iterate 39 models
  // without writing 39 near-identical blocks. The keys come from TENANT_SCOPED_TABLE_BY_DELEGATE,
  // which `tenant-tables.test.ts` pins to schema.prisma, so an unknown key is a test failure
  // rather than a runtime surprise.
  const client = prisma as unknown as Record<string, CountableDelegate>;

  const counts: TableCounts[] = [];
  for (const [delegateName, table] of TENANT_SCOPED_TABLE_BY_DELEGATE) {
    const delegate = client[delegateName];
    if (!delegate) throw new Error(`Prisma has no delegate named "${delegateName}"`);
    counts.push(await countsFor(delegate, table, knownTenantIds));
  }

  const report = reconcileTenants({
    counts,
    knownTenantIds,
    expectedSoleTenantId: allowManyTenants ? undefined : FOUNDING_TENANT_ID,
  });

  if (report.ok) {
    console.log(
      `tenant reconciliation: OK — ${report.rowsChecked} rows across ${report.tablesChecked} tables, ` +
        `every one belonging to exactly one existing tenant` +
        (allowManyTenants ? "." : ` ("${FOUNDING_TENANT_ID}").`),
    );
    return;
  }

  console.error("tenant reconciliation: FAILED\n");
  for (const finding of report.findings) console.error(`  - ${describeFinding(finding)}`);
  console.error(
    `\n${report.rowsChecked} rows across ${report.tablesChecked} tables. ` +
      "Do NOT apply 20260829112500_tenants_contract until this is clean.",
  );
  process.exitCode = 1;
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
