import { TENANT_SCOPED_TABLES, type TenantScopedTable } from "./tenant-tables";

/**
 * Phase 6.2's done-when, as a function: "reconciliation proves every row belongs to exactly one
 * tenant".
 *
 * The proof lives here rather than inside the runner script so it can be tested. A reconciliation
 * that has never been shown to fail is not evidence of anything, and it cannot be shown to fail
 * against a database that only ever holds the good state — so the arithmetic is pure, the counts
 * arrive as data, and the script that reads a real database is a thin shell around it.
 *
 * "Exactly one" decomposes into three claims, and all three are checked because each fails
 * differently:
 *
 *   AT LEAST ONE   no row has a NULL `tenantId`. This is what the contract migration's
 *                  `SET NOT NULL` would catch, but it catches it as an opaque constraint
 *                  violation on whichever table Postgres reached first. Here it names every
 *                  offending table and how many rows, before the ALTER runs.
 *   AT MOST ONE    `tenantId` is a scalar column, so a row cannot literally carry two. The real
 *                  failure mode is a row pointing at a tenant that does not exist — a dangling
 *                  reference that belongs to no tenant while looking like it belongs to one.
 *   THE RIGHT ONE  before a second tenant exists, every row must belong to tenant #1. A row
 *                  assigned to some other tenant during the backfill means the backfill ran twice
 *                  against a changed database, and silently re-homed data.
 */

/** Row counts for one table, as the runner reads them. */
export interface TableCounts {
  readonly table: TenantScopedTable;
  /** Every row, including those the other two counts describe. */
  readonly total: number;
  /** Rows whose `tenantId` is NULL. */
  readonly orphaned: number;
  /** Rows whose `tenantId` names a tenant with no row in `tenants`. */
  readonly dangling: number;
  /** Rows grouped by the tenant they claim, `tenantId` -> count. NULLs are excluded. */
  readonly byTenant: Readonly<Record<string, number>>;
}

export interface ReconciliationInput {
  readonly counts: readonly TableCounts[];
  /** Tenant ids that exist in `tenants`. */
  readonly knownTenantIds: readonly string[];
  /**
   * The tenant every row is expected to belong to, when only one tenant exists.
   *
   * Omitted once the installation genuinely serves several tenants: at that point "every row
   * belongs to tenant #1" is no longer the invariant, but "no orphans, no dangling references"
   * still is.
   */
  readonly expectedSoleTenantId?: string | undefined;
}

export type ReconciliationFinding =
  | { readonly kind: "orphaned"; readonly table: TenantScopedTable; readonly rows: number }
  | { readonly kind: "dangling"; readonly table: TenantScopedTable; readonly rows: number }
  | {
      readonly kind: "unexpected-tenant";
      readonly table: TenantScopedTable;
      readonly tenantId: string;
      readonly rows: number;
    }
  | { readonly kind: "table-not-counted"; readonly table: TenantScopedTable }
  | { readonly kind: "counts-disagree"; readonly table: TenantScopedTable; readonly detail: string }
  | { readonly kind: "no-tenants"; readonly detail: string };

export interface ReconciliationReport {
  readonly ok: boolean;
  readonly findings: readonly ReconciliationFinding[];
  readonly tablesChecked: number;
  readonly rowsChecked: number;
}

/**
 * Reconcile the counts. Pure — no database, no clock, no environment.
 *
 * Reports EVERY finding rather than stopping at the first: an operator running this before a
 * migration window needs the whole list, not one table at a time.
 */
export function reconcileTenants(input: ReconciliationInput): ReconciliationReport {
  const findings: ReconciliationFinding[] = [];
  const known = new Set(input.knownTenantIds);
  const counted = new Map(input.counts.map((c) => [c.table, c]));

  if (known.size === 0) {
    findings.push({
      kind: "no-tenants",
      detail:
        "`tenants` is empty. Either 20260829112000_tenants_backfill has not run, or it ran against " +
        "a different database than the one being reconciled.",
    });
  }

  let rowsChecked = 0;

  // Driven by the declared table list, not by what the runner happened to query: a tenant-scoped
  // table added later and forgotten by the runner must fail the check, not pass it by absence.
  for (const table of TENANT_SCOPED_TABLES) {
    const counts = counted.get(table);
    if (!counts) {
      findings.push({ kind: "table-not-counted", table });
      continue;
    }

    rowsChecked += counts.total;

    if (counts.orphaned > 0) {
      findings.push({ kind: "orphaned", table, rows: counts.orphaned });
    }
    if (counts.dangling > 0) {
      findings.push({ kind: "dangling", table, rows: counts.dangling });
    }

    for (const [tenantId, rows] of Object.entries(counts.byTenant)) {
      if (rows === 0) continue;
      if (!known.has(tenantId)) {
        // Already reported in aggregate by `dangling`; naming the tenant is what makes it
        // actionable, so both are emitted rather than one standing in for the other.
        findings.push({ kind: "unexpected-tenant", table, tenantId, rows });
        continue;
      }
      if (input.expectedSoleTenantId !== undefined && tenantId !== input.expectedSoleTenantId) {
        findings.push({ kind: "unexpected-tenant", table, tenantId, rows });
      }
    }

    const assigned = Object.values(counts.byTenant).reduce((sum, rows) => sum + rows, 0);
    if (assigned + counts.orphaned !== counts.total) {
      findings.push({
        kind: "counts-disagree",
        table,
        detail:
          `${assigned} rows assigned to a tenant + ${counts.orphaned} orphaned != ${counts.total} total. ` +
          "The counts were read at different moments and the table changed underneath them; re-run " +
          "against a quiesced database.",
      });
    }
  }

  return {
    ok: findings.length === 0,
    findings,
    tablesChecked: TENANT_SCOPED_TABLES.length,
    rowsChecked,
  };
}

/** One line per finding, ready to print. Kept beside the rules so the wording is testable too. */
export function describeFinding(finding: ReconciliationFinding): string {
  switch (finding.kind) {
    case "orphaned":
      return `${finding.table}: ${finding.rows} row(s) with tenantId IS NULL — they belong to no tenant and 20260829112500_tenants_contract will abort on them.`;
    case "dangling":
      return `${finding.table}: ${finding.rows} row(s) reference a tenant that does not exist in "tenants".`;
    case "unexpected-tenant":
      return `${finding.table}: ${finding.rows} row(s) assigned to tenant "${finding.tenantId}", which is not the expected tenant.`;
    case "table-not-counted":
      return `${finding.table}: never counted — the reconciliation runner does not know about this table, so nothing was proven about it.`;
    case "counts-disagree":
      return `${finding.table}: ${finding.detail}`;
    case "no-tenants":
      return finding.detail;
  }
}
