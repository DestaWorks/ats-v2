import { describe, expect, it } from "vitest";

import { describeFinding, reconcileTenants, type TableCounts } from "./tenant-reconciliation";
import { FOUNDING_TENANT_ID, TENANT_SCOPED_TABLES } from "./tenant-tables";

/**
 * The reconciliation cannot be run against a database here, and running it against the good state
 * would prove nothing anyway — a check that has never been shown to fail is not evidence. So the
 * arithmetic is exercised against fixtures that encode each way the backfill can go wrong.
 */

const OTHER_TENANT = "tnt_someone_else";

/** A whole database in the state the backfill is supposed to leave behind. */
function cleanCounts(rowsPerTable = 10): TableCounts[] {
  return TENANT_SCOPED_TABLES.map((table) => ({
    table,
    total: rowsPerTable,
    orphaned: 0,
    dangling: 0,
    byTenant: { [FOUNDING_TENANT_ID]: rowsPerTable },
  }));
}

/** Replace one table's counts, leaving the rest clean. */
function withTable(table: string, override: Partial<TableCounts>): TableCounts[] {
  return cleanCounts().map((counts) =>
    counts.table === table ? { ...counts, ...override } : counts,
  );
}

const BASE = {
  knownTenantIds: [FOUNDING_TENANT_ID],
  expectedSoleTenantId: FOUNDING_TENANT_ID,
};

describe("reconcileTenants", () => {
  it("passes when every row in every table belongs to tenant #1", () => {
    const report = reconcileTenants({ ...BASE, counts: cleanCounts() });

    expect(report.ok).toBe(true);
    expect(report.findings).toEqual([]);
    expect(report.tablesChecked).toBe(39);
    expect(report.rowsChecked).toBe(390);
  });

  it("passes on an empty database — no rows is vacuously every row", () => {
    const report = reconcileTenants({ ...BASE, counts: cleanCounts(0) });

    expect(report.ok).toBe(true);
    expect(report.rowsChecked).toBe(0);
  });

  it("fails on a row the backfill missed, naming the table and the count", () => {
    const report = reconcileTenants({
      ...BASE,
      counts: withTable("candidates", {
        total: 10,
        orphaned: 3,
        byTenant: { [FOUNDING_TENANT_ID]: 7 },
      }),
    });

    expect(report.ok).toBe(false);
    expect(report.findings).toContainEqual({ kind: "orphaned", table: "candidates", rows: 3 });
    expect(describeFinding(report.findings[0]!)).toContain("candidates: 3 row(s)");
  });

  it("fails on a row pointing at a tenant that does not exist", () => {
    const report = reconcileTenants({
      ...BASE,
      counts: withTable("documents", {
        total: 10,
        dangling: 2,
        byTenant: { [FOUNDING_TENANT_ID]: 8, [OTHER_TENANT]: 2 },
      }),
    });

    expect(report.ok).toBe(false);
    expect(report.findings).toContainEqual({ kind: "dangling", table: "documents", rows: 2 });
    expect(report.findings).toContainEqual({
      kind: "unexpected-tenant",
      table: "documents",
      tenantId: OTHER_TENANT,
      rows: 2,
    });
  });

  it("fails when rows were assigned to a real but unexpected tenant", () => {
    const report = reconcileTenants({
      ...BASE,
      knownTenantIds: [FOUNDING_TENANT_ID, OTHER_TENANT],
      counts: withTable("source_leads", {
        total: 10,
        byTenant: { [FOUNDING_TENANT_ID]: 6, [OTHER_TENANT]: 4 },
      }),
    });

    expect(report.ok).toBe(false);
    expect(report.findings).toContainEqual({
      kind: "unexpected-tenant",
      table: "source_leads",
      tenantId: OTHER_TENANT,
      rows: 4,
    });
  });

  it("accepts several tenants once no sole tenant is expected", () => {
    const report = reconcileTenants({
      counts: withTable("source_leads", {
        total: 10,
        byTenant: { [FOUNDING_TENANT_ID]: 6, [OTHER_TENANT]: 4 },
      }),
      knownTenantIds: [FOUNDING_TENANT_ID, OTHER_TENANT],
      expectedSoleTenantId: undefined,
    });

    expect(report.ok).toBe(true);
  });

  it("fails when a tenant-scoped table was never counted, rather than passing by absence", () => {
    const report = reconcileTenants({
      ...BASE,
      counts: cleanCounts().filter((counts) => counts.table !== "mentions"),
    });

    expect(report.ok).toBe(false);
    expect(report.findings).toContainEqual({ kind: "table-not-counted", table: "mentions" });
    expect(describeFinding(report.findings[0]!)).toContain("nothing was proven about it");
  });

  it("fails when the per-tenant counts do not add up to the table total", () => {
    const report = reconcileTenants({
      ...BASE,
      counts: withTable("clients", {
        total: 10,
        orphaned: 0,
        byTenant: { [FOUNDING_TENANT_ID]: 9 },
      }),
    });

    expect(report.ok).toBe(false);
    expect(report.findings.some((f) => f.kind === "counts-disagree")).toBe(true);
  });

  it("fails when the tenants table is empty, whatever the row counts say", () => {
    const report = reconcileTenants({
      counts: cleanCounts(0),
      knownTenantIds: [],
      expectedSoleTenantId: FOUNDING_TENANT_ID,
    });

    expect(report.ok).toBe(false);
    const finding = report.findings.find((f) => f.kind === "no-tenants");
    expect(finding).toBeDefined();
    expect(describeFinding(finding!)).toContain("`tenants` is empty");
  });

  it("reports every offending table, not just the first", () => {
    const counts = cleanCounts().map((c) =>
      c.table === "candidates" || c.table === "clients"
        ? { ...c, total: 10, orphaned: 1, byTenant: { [FOUNDING_TENANT_ID]: 9 } }
        : c,
    );
    const report = reconcileTenants({ ...BASE, counts });

    expect(report.findings.filter((f) => f.kind === "orphaned")).toHaveLength(2);
  });
});
