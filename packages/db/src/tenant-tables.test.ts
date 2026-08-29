import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  TENANT_SCOPED_DELEGATES,
  TENANT_SCOPED_TABLES,
  TENANT_SCOPED_TABLE_BY_DELEGATE,
} from "./tenant-tables";

/**
 * The hand-maintained list in `tenant-tables.ts` is only useful if it cannot drift from the schema
 * it claims to describe — a reconciliation that skips a table proves nothing about that table, and
 * proves it silently.
 *
 * So the schema file is the authority here, exactly as it is for the DTO published-surface guard:
 * a model added in a later phase fails this test until it is classified as tenant-scoped or
 * global, rather than defaulting to "not checked".
 */

const SCHEMA = readFileSync(
  fileURLToPath(new URL("../prisma/schema.prisma", import.meta.url)),
  "utf8",
);

/**
 * Models the seam exempts from tenant scoping — mirrors `GLOBAL_MODELS` in `tenant-scope.ts`.
 *
 * `Membership` is the one to read twice: it HAS a `tenantId` column and is still global, because a
 * query filtered by the active tenant could never answer "which tenants may this user switch to".
 * So membership of this set, not the presence of the column, is what decides.
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

function modelBlocks(): { model: string; table: string; hasTenantId: boolean }[] {
  return [...SCHEMA.matchAll(/^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm)].map((match) => {
    const model = String(match[1]);
    const body = String(match[2]);
    const mapped = /@@map\("([^"]+)"\)/.exec(body);
    return {
      model,
      table: mapped ? String(mapped[1]) : model,
      hasTenantId: /^\s*tenantId\s+String/m.test(body),
    };
  });
}

describe("the tenant-scoped table list matches the schema", () => {
  const models = modelBlocks();

  it("covers every non-global model that declares a tenantId column", () => {
    const expected = models
      .filter((m) => m.hasTenantId && !GLOBAL_MODELS.has(m.model))
      .map((m) => m.table)
      .sort();
    expect([...TENANT_SCOPED_TABLES].sort()).toEqual(expected);
  });

  it("classifies every model as either tenant-scoped or global — none in neither", () => {
    const scoped: ReadonlySet<string> = new Set(TENANT_SCOPED_TABLES);
    const unclassified = models
      .filter((m) => !GLOBAL_MODELS.has(m.model) && !scoped.has(m.table))
      .map((m) => m.model);
    expect(
      unclassified,
      "A model belongs to a tenant or it does not. One that is in neither list is invisible to the " +
        "reconciliation and exempt from nothing — add it to TENANT_SCOPED_TABLES, or to GLOBAL_MODELS " +
        "in tenant-scope.ts with a reason.",
    ).toEqual([]);
  });

  it("claims no table the schema does not have", () => {
    const tables: ReadonlySet<string> = new Set(models.map((m) => m.table));
    expect(TENANT_SCOPED_TABLES.filter((table) => !tables.has(table))).toEqual([]);
  });

  it("pairs each delegate with exactly one table", () => {
    expect(TENANT_SCOPED_DELEGATES.length).toBe(TENANT_SCOPED_TABLES.length);
    expect(TENANT_SCOPED_TABLE_BY_DELEGATE.size).toBe(TENANT_SCOPED_TABLES.length);
    expect(new Set(TENANT_SCOPED_DELEGATES).size).toBe(TENANT_SCOPED_DELEGATES.length);
  });

  it("names the tenant-scoped tables the migrations touch — 39 of them", () => {
    expect(TENANT_SCOPED_TABLES.length).toBe(39);
  });
});
